package localassistant

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"testing"
	"time"
)

type lamp struct {
	heard chan string
}

func (plugin *lamp) Add(context *Context, values Values) (FoundDevice, error) {
	serial, _ := values["serial"].(string)
	if serial == "" {
		return FoundDevice{}, errors.New("type the serial")
	}
	return FoundDevice{Kind: "demo-lamp", ExternalID: serial}, nil
}

func (plugin *lamp) Start(context *Context) error {
	return context.Subscribe("lamps/+", func(topic string, payload []byte) {
		plugin.heard <- topic + "=" + string(payload)
	})
}

func (plugin *lamp) Read(context *Context, device Device) (any, error) {
	settings, err := context.Settings()
	if err != nil {
		return nil, err
	}
	return SwitchState{Type: "switch", On: Bool(settings["token"] == device.Secret("pin"))}, nil
}

func (plugin *lamp) Serve(context *Context, device Device, request Request) (Response, error) {
	return Response{Headers: map[string]string{"content-type": "text/plain"}, Body: []byte(request.Path)}, nil
}

type host struct {
	t       *testing.T
	toSDK   *io.PipeWriter
	fromSDK *bufio.Scanner
	nextID  int64
}

func newHost(t *testing.T, plugin any) *host {
	hostReader, sdkWriter := io.Pipe()
	sdkReader, hostWriter := io.Pipe()
	go func() {
		_ = Serve(plugin, sdkReader, sdkWriter)
		_ = sdkWriter.Close()
	}()
	return &host{t: t, toSDK: hostWriter, fromSDK: bufio.NewScanner(hostReader)}
}

func (host *host) write(value message) {
	value.JSONRPC = "2.0"
	line, _ := json.Marshal(value)
	if _, err := host.toSDK.Write(append(line, '\n')); err != nil {
		host.t.Fatal(err)
	}
}

func (host *host) read() message {
	if !host.fromSDK.Scan() {
		host.t.Fatal("the SDK closed its output")
	}
	var value message
	if err := json.Unmarshal(host.fromSDK.Bytes(), &value); err != nil {
		host.t.Fatal(err)
	}
	return value
}

func (host *host) call(method string, params any) message {
	host.nextID++
	id := host.nextID
	encoded, _ := json.Marshal(params)
	host.write(message{ID: &id, Method: method, Params: encoded})
	return host.read()
}

func TestHooksAndCalls(t *testing.T) {
	plugin := &lamp{heard: make(chan string, 1)}
	host := newHost(t, plugin)

	initialized := host.call("initialize", map[string]any{"protocolVersion": 1})
	var hooks struct {
		Hooks []string `json:"hooks"`
	}
	_ = json.Unmarshal(initialized.Result, &hooks)
	if len(hooks.Hooks) != 4 || hooks.Hooks[0] != "add" || hooks.Hooks[3] != "serve" {
		t.Fatalf("hooks: %v", hooks.Hooks)
	}

	added := host.call("add", map[string]any{"values": map[string]any{"serial": "L1"}})
	var found FoundDevice
	_ = json.Unmarshal(added.Result, &found)
	if found.ExternalID != "L1" || found.Kind != "demo-lamp" {
		t.Fatalf("found: %+v", found)
	}
	refused := host.call("add", map[string]any{"values": map[string]any{}})
	if refused.Error == nil || refused.Error.Message != "type the serial" {
		t.Fatalf("refused: %+v", refused)
	}
	missing := host.call("clips", map[string]any{})
	if missing.Error == nil {
		t.Fatal("clips should be refused")
	}

	host.nextID++
	readID := host.nextID
	device, _ := json.Marshal(map[string]any{"device": Device{ID: "d1", Secrets: map[string]string{"pin": "1234"}}})
	host.write(message{ID: &readID, Method: "read", Params: device})
	asked := host.read()
	if asked.Method != "settings" || asked.ID == nil {
		t.Fatalf("expected a settings call, got %+v", asked)
	}
	settings, _ := json.Marshal(Values{"token": "1234"})
	host.write(message{ID: asked.ID, Result: settings})
	read := host.read()
	var state SwitchState
	_ = json.Unmarshal(read.Result, &state)
	if state.On == nil || !*state.On || *read.ID != readID {
		t.Fatalf("read: %+v", read)
	}

	host.nextID++
	startID := host.nextID
	host.write(message{ID: &startID, Method: "start", Params: json.RawMessage(`{}`)})
	subscribe := host.read()
	if subscribe.Method != "mqtt.subscribe" {
		t.Fatalf("expected a subscription, got %+v", subscribe)
	}
	host.write(message{ID: subscribe.ID, Result: json.RawMessage(`null`)})
	if started := host.read(); started.Error != nil {
		t.Fatalf("start: %+v", started)
	}
	payload, _ := json.Marshal(map[string]any{"topic": "lamps/desk", "payload": base64.StdEncoding.EncodeToString([]byte("on"))})
	host.write(message{Method: "mqtt.message", Params: payload})
	select {
	case heard := <-plugin.heard:
		if heard != "lamps/desk=on" {
			t.Fatalf("heard %s", heard)
		}
	case <-time.After(time.Second):
		t.Fatal("the subscription heard nothing")
	}

	served := host.call("serve", map[string]any{"device": Device{ID: "d1"}, "path": "a/b.txt", "method": "GET"})
	var response struct {
		Status int    `json:"status"`
		Body   string `json:"body"`
	}
	_ = json.Unmarshal(served.Result, &response)
	body, _ := base64.StdEncoding.DecodeString(response.Body)
	if response.Status != 200 || string(body) != "a/b.txt" {
		t.Fatalf("served: %+v", response)
	}
}

func TestContextCalls(t *testing.T) {
	reader, writer := io.Pipe()
	context := newContext(writer)
	context.timeout = 50 * time.Millisecond
	scanner := bufio.NewScanner(reader)
	answer := func(result string) {
		if !scanner.Scan() {
			t.Error("nothing sent")
			return
		}
		var sent message
		_ = json.Unmarshal(scanner.Bytes(), &sent)
		context.pendingLock.Lock()
		reply := context.pending[*sent.ID]
		context.pendingLock.Unlock()
		reply <- message{ID: sent.ID, Result: json.RawMessage(result)}
	}
	go answer(`[{"id":"d1","kind":"demo-lamp","fields":{"serial":"L1"}}]`)
	devices, err := context.Devices()
	if err != nil || len(devices) != 1 || devices[0].Field("serial") != "L1" || devices[0].Field("other") != "" {
		t.Fatalf("devices: %v %v", devices, err)
	}
	go answer(`2`)
	if added, err := context.Found([]FoundDevice{{Kind: "demo-lamp", ExternalID: "x"}}); err != nil || added != 2 {
		t.Fatalf("found: %d %v", added, err)
	}
	go answer(`"/data/plugin-data/demo/x"`)
	if path, err := context.Folder("x"); err != nil || path != "/data/plugin-data/demo/x" {
		t.Fatalf("folder: %s %v", path, err)
	}
	go answer(`null`)
	if device, err := context.Device("gone"); err != nil || device != nil {
		t.Fatalf("device: %v %v", device, err)
	}
	for _, call := range []func() error{
		func() error { return context.SaveState("d1", SwitchState{Type: "switch"}) },
		func() error { return context.SaveError("d1", "unreachable") },
		func() error { return context.RefreshLater("d1", time.Second) },
		func() error { return context.Notify(Notification{Title: "Hi", Body: "There", Audience: "admins"}) },
		func() error { return context.Publish("lamps/desk", "on") },
		func() error { return context.RecordEnergy("d1", time.Now(), 1.5) },
	} {
		go answer(`null`)
		if err := call(); err != nil {
			t.Fatal(err)
		}
	}
	go answer(`true`)
	if configured, err := context.MqttConfigured(); err != nil || !configured {
		t.Fatalf("configured: %v %v", configured, err)
	}
	go answer(`[{"hour":"2026-10-28T12:00:00Z","total":3.5}]`)
	if readings, err := context.EnergyReadings("d1"); err != nil || readings[0].Total != 3.5 {
		t.Fatalf("readings: %v %v", readings, err)
	}
	go func() {
		scanner.Scan()
	}()
	context.Log("info", "hello", map[string]any{"a": 1})
	go func() {
		scanner.Scan()
	}()
	if _, err := context.Settings(); err == nil {
		t.Fatal("an unanswered call should time out")
	}
}

func TestMatches(t *testing.T) {
	cases := map[[2]string]bool{
		{"a/+/c", "a/b/c"}: true,
		{"a/#", "a/b/c"}:   true,
		{"a/+", "a/b/c"}:   false,
		{"a/b", "a"}:       false,
		{"a/b", "a/b"}:     true,
	}
	for input, want := range cases {
		if got := Matches(input[0], input[1]); got != want {
			t.Errorf("Matches(%q, %q) = %v", input[0], input[1], got)
		}
	}
	if *Float(1) != 1 || *String("a") != "a" {
		t.Fatal("pointers")
	}
}

func TestNewStateShapes(t *testing.T) {
	on := true
	encoded, err := json.Marshal(LightState{Type: "light", On: &on, MinTemperature: 2000, MaxTemperature: 6500, Features: []string{"brightness"}})
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"type":"light","on":true,"brightness":null,"temperature":null,"minTemperature":2000,"maxTemperature":6500,"color":null,"features":["brightness"]}` {
		t.Fatalf("light encoded as %s", encoded)
	}
	var command Command
	if err := json.Unmarshal([]byte(`{"type":"lock","locked":false}`), &command); err != nil {
		t.Fatal(err)
	}
	if command.Locked == nil || *command.Locked {
		t.Fatalf("lock command decoded as %+v", command)
	}
	var change MediaChange
	if err := json.Unmarshal([]byte(`{"action":"next","volume":40}`), &change); err != nil {
		t.Fatal(err)
	}
	if *change.Action != "next" || *change.Volume != 40 {
		t.Fatalf("media change decoded as %+v", change)
	}
}

func TestRequestHeaders(t *testing.T) {
	headers := RequestHeaders("X-Token: abc\r\nbroken\n: nothing\nAuthorization: Bearer x")
	if len(headers) != 2 || headers["X-Token"] != "abc" || headers["Authorization"] != "Bearer x" {
		t.Fatalf("unexpected headers %v", headers)
	}
	if len(RequestHeaders(nil)) != 0 {
		t.Fatal("no value means no headers")
	}
}
