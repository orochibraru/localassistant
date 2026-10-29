package localassistant

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
	"time"
)

// ProtocolVersion is the JSON-RPC conversation this SDK speaks with LocalAssistant.
const ProtocolVersion = 1

// Connector checks and accepts the values of a plugin's connection form.
type Connector interface {
	Connect(context *Context, values Values) error
}

// Discoverer finds the devices behind a plugin's connection.
type Discoverer interface {
	Discover(context *Context) ([]FoundDevice, error)
}

// Adder turns a plugin's add-a-device form into the device it means.
type Adder interface {
	Add(context *Context, values Values) (FoundDevice, error)
}

// Starter opens a plugin's long-running connections in the worker.
type Starter interface {
	Start(context *Context) error
}

// Stopper closes what Start opened.
type Stopper interface {
	Stop(context *Context) error
}

// Reader reads a device's state; the worker calls it every two minutes.
type Reader interface {
	Read(context *Context, device Device) (any, error)
}

// Commander applies a person's command and returns the new state, or nil.
type Commander interface {
	Command(context *Context, device Device, command Command) (any, error)
}

// Server answers media requests under /media/<device>/<path>.
type Server interface {
	Serve(context *Context, device Device, request Request) (Response, error)
}

// Clipper lists a camera's recordings or events.
type Clipper interface {
	Clips(context *Context, device Device) (CameraClips, error)
}

type message struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      *int64          `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Context is the plugin's line to LocalAssistant: its settings, its devices, the shared MQTT broker and the log.
type Context struct {
	writer      io.Writer
	writeLock   sync.Mutex
	pendingLock sync.Mutex
	pending     map[int64]chan message
	nextID      int64
	handlers    map[string]func(topic string, payload []byte)
	timeout     time.Duration
}

func newContext(writer io.Writer) *Context {
	return &Context{
		writer:   writer,
		pending:  map[int64]chan message{},
		nextID:   1_000_000,
		handlers: map[string]func(string, []byte){},
		timeout:  time.Minute,
	}
}

func (context *Context) send(value message) error {
	value.JSONRPC = "2.0"
	line, err := json.Marshal(value)
	if err != nil {
		return err
	}
	context.writeLock.Lock()
	defer context.writeLock.Unlock()
	_, err = context.writer.Write(append(line, '\n'))
	return err
}

func (context *Context) call(method string, params any, result any) error {
	encoded, err := json.Marshal(params)
	if err != nil {
		return err
	}
	context.pendingLock.Lock()
	context.nextID++
	id := context.nextID
	answer := make(chan message, 1)
	context.pending[id] = answer
	context.pendingLock.Unlock()
	if err := context.send(message{ID: &id, Method: method, Params: encoded}); err != nil {
		return err
	}
	select {
	case reply := <-answer:
		if reply.Error != nil {
			return errors.New(reply.Error.Message)
		}
		if result == nil || len(reply.Result) == 0 {
			return nil
		}
		return json.Unmarshal(reply.Result, result)
	case <-time.After(context.timeout):
		context.pendingLock.Lock()
		delete(context.pending, id)
		context.pendingLock.Unlock()
		return fmt.Errorf("LocalAssistant didn't answer %s in time", method)
	}
}

// Log writes a line to LocalAssistant's log at level debug, info, warn or error.
func (context *Context) Log(level string, text string, fields map[string]any) {
	params, _ := json.Marshal(map[string]any{"level": level, "message": text, "context": fields})
	_ = context.send(message{Method: "log", Params: params})
}

// Settings returns what the plugin is connected with, secrets decrypted, or nil when it isn't connected.
func (context *Context) Settings() (Values, error) {
	var values Values
	err := context.call("settings", map[string]any{}, &values)
	return values, err
}

// Devices returns the plugin's devices.
func (context *Context) Devices() ([]Device, error) {
	var devices []Device
	err := context.call("devices", map[string]any{}, &devices)
	return devices, err
}

// Device returns one of the plugin's devices, or nil when it has none with that id.
func (context *Context) Device(id string) (*Device, error) {
	var device *Device
	err := context.call("device", map[string]any{"id": id}, &device)
	return device, err
}

// Found adds or updates discovered devices, keeping the names and rooms people gave them; it returns how many are new.
func (context *Context) Found(devices []FoundDevice) (int, error) {
	var added int
	err := context.call("found", map[string]any{"devices": devices}, &added)
	return added, err
}

// SaveState records what a device reports, for devices whose state the plugin pushes.
func (context *Context) SaveState(deviceID string, state any) error {
	return context.call("saveState", map[string]any{"deviceId": deviceID, "state": state}, nil)
}

// SaveError records why a device couldn't be reached.
func (context *Context) SaveError(deviceID string, text string) error {
	return context.call("saveError", map[string]any{"deviceId": deviceID, "message": text}, nil)
}

// RefreshLater has the worker read a device again after delay.
func (context *Context) RefreshLater(deviceID string, delay time.Duration) error {
	return context.call("refreshLater", map[string]any{"deviceId": deviceID, "delayMs": delay.Milliseconds()}, nil)
}

// Notify sends a push notification.
func (context *Context) Notify(notification Notification) error {
	return context.call("notify", notification, nil)
}

// Folder returns a folder of the plugin's own under the data folder, created if needed.
func (context *Context) Folder(parts ...string) (string, error) {
	var path string
	err := context.call("folder", map[string]any{"parts": parts}, &path)
	return path, err
}

// MqttConfigured says whether an admin connected the shared MQTT broker.
func (context *Context) MqttConfigured() (bool, error) {
	var configured bool
	err := context.call("mqtt.configured", map[string]any{}, &configured)
	return configured, err
}

// Subscribe hands handler every message of the shared broker whose topic matches filter.
func (context *Context) Subscribe(filter string, handler func(topic string, payload []byte)) error {
	context.pendingLock.Lock()
	context.handlers[filter] = handler
	context.pendingLock.Unlock()
	return context.call("mqtt.subscribe", map[string]any{"filter": filter}, nil)
}

// Publish sends payload on topic through the shared broker.
func (context *Context) Publish(topic string, payload string) error {
	return context.call("mqtt.publish", map[string]any{"topic": topic, "payload": payload}, nil)
}

// EnergyReadings returns a meter's stored counter readings, oldest first.
func (context *Context) EnergyReadings(deviceID string) ([]Reading, error) {
	var readings []Reading
	err := context.call("energy.readings", map[string]any{"deviceId": deviceID}, &readings)
	return readings, err
}

// RecordEnergy stores a meter's counter, in kWh, for the hour starting at hour.
func (context *Context) RecordEnergy(deviceID string, hour time.Time, total float64) error {
	return context.call("energy.record", map[string]any{"deviceId": deviceID, "hour": hour.UTC().Format(time.RFC3339), "total": total}, nil)
}

func hooksOf(plugin any) []string {
	hooks := []string{}
	if _, ok := plugin.(Connector); ok {
		hooks = append(hooks, "connect")
	}
	if _, ok := plugin.(Discoverer); ok {
		hooks = append(hooks, "discover")
	}
	if _, ok := plugin.(Adder); ok {
		hooks = append(hooks, "add")
	}
	if _, ok := plugin.(Starter); ok {
		hooks = append(hooks, "start")
	}
	if _, ok := plugin.(Stopper); ok {
		hooks = append(hooks, "stop")
	}
	if _, ok := plugin.(Reader); ok {
		hooks = append(hooks, "read")
	}
	if _, ok := plugin.(Commander); ok {
		hooks = append(hooks, "command")
	}
	if _, ok := plugin.(Server); ok {
		hooks = append(hooks, "serve")
	}
	if _, ok := plugin.(Clipper); ok {
		hooks = append(hooks, "clips")
	}
	return hooks
}

type hookParams struct {
	Values  Values            `json:"values"`
	Device  Device            `json:"device"`
	Command Command           `json:"command"`
	Path    string            `json:"path"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
}

func (context *Context) dispatch(plugin any, method string, raw json.RawMessage) (any, error) {
	var params hookParams
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, err
		}
	}
	switch method {
	case "initialize":
		return map[string]any{"protocolVersion": ProtocolVersion, "hooks": hooksOf(plugin)}, nil
	case "connect":
		if hook, ok := plugin.(Connector); ok {
			return nil, hook.Connect(context, params.Values)
		}
	case "discover":
		if hook, ok := plugin.(Discoverer); ok {
			return hook.Discover(context)
		}
	case "add":
		if hook, ok := plugin.(Adder); ok {
			return hook.Add(context, params.Values)
		}
	case "start":
		if hook, ok := plugin.(Starter); ok {
			return nil, hook.Start(context)
		}
	case "stop":
		if hook, ok := plugin.(Stopper); ok {
			return nil, hook.Stop(context)
		}
	case "read":
		if hook, ok := plugin.(Reader); ok {
			return hook.Read(context, params.Device)
		}
	case "command":
		if hook, ok := plugin.(Commander); ok {
			return hook.Command(context, params.Device, params.Command)
		}
	case "serve":
		if hook, ok := plugin.(Server); ok {
			response, err := hook.Serve(context, params.Device, Request{Path: params.Path, Method: params.Method, Headers: params.Headers})
			if err != nil {
				return nil, err
			}
			status := response.Status
			if status == 0 {
				status = 200
			}
			return map[string]any{"status": status, "headers": response.Headers, "body": base64.StdEncoding.EncodeToString(response.Body)}, nil
		}
	case "clips":
		if hook, ok := plugin.(Clipper); ok {
			return hook.Clips(context, params.Device)
		}
	}
	return nil, fmt.Errorf("the plugin has no %s", method)
}

func (context *Context) handle(plugin any, incoming message) {
	if incoming.Method == "mqtt.message" {
		var params struct {
			Topic   string `json:"topic"`
			Payload string `json:"payload"`
		}
		if json.Unmarshal(incoming.Params, &params) != nil {
			return
		}
		payload, _ := base64.StdEncoding.DecodeString(params.Payload)
		context.pendingLock.Lock()
		handlers := make([]func(string, []byte), 0, len(context.handlers))
		for filter, handler := range context.handlers {
			if Matches(filter, params.Topic) {
				handlers = append(handlers, handler)
			}
		}
		context.pendingLock.Unlock()
		for _, handler := range handlers {
			handler(params.Topic, payload)
		}
		return
	}
	result, err := context.dispatch(plugin, incoming.Method, incoming.Params)
	if incoming.ID == nil {
		return
	}
	if err != nil {
		_ = context.send(message{ID: incoming.ID, Error: &rpcError{Code: -32000, Message: err.Error()}})
		return
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		_ = context.send(message{ID: incoming.ID, Error: &rpcError{Code: -32000, Message: err.Error()}})
		return
	}
	_ = context.send(message{ID: incoming.ID, Result: encoded})
}

// Matches says whether topic matches the MQTT filter, with + for one level and a trailing # for the rest.
func Matches(filter string, topic string) bool {
	wanted := splitTopic(filter)
	given := splitTopic(topic)
	for index, level := range wanted {
		if level == "#" {
			return true
		}
		if index >= len(given) || (level != "+" && level != given[index]) {
			return false
		}
	}
	return len(wanted) == len(given)
}

func splitTopic(topic string) []string {
	levels := []string{}
	start := 0
	for index := 0; index < len(topic); index++ {
		if topic[index] == '/' {
			levels = append(levels, topic[start:index])
			start = index + 1
		}
	}
	return append(levels, topic[start:])
}

// Serve runs plugin over reader and writer until reader ends: LocalAssistant calls its hooks, it calls back through the Context.
func Serve(plugin any, reader io.Reader, writer io.Writer) error {
	context := newContext(writer)
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 1024*1024), 64*1024*1024)
	var running sync.WaitGroup
	for scanner.Scan() {
		var incoming message
		if err := json.Unmarshal(scanner.Bytes(), &incoming); err != nil {
			continue
		}
		if incoming.Method == "" && incoming.ID != nil {
			context.pendingLock.Lock()
			answer, ok := context.pending[*incoming.ID]
			delete(context.pending, *incoming.ID)
			context.pendingLock.Unlock()
			if ok {
				answer <- incoming
			}
			continue
		}
		running.Add(1)
		go func(incoming message) {
			defer running.Done()
			context.handle(plugin, incoming)
		}(incoming)
	}
	running.Wait()
	return scanner.Err()
}

// Run serves plugin on standard input and output, as LocalAssistant starts it; it returns when LocalAssistant goes away.
func Run(plugin any) {
	if err := Serve(plugin, os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
