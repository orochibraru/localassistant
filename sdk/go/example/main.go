package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	localassistant "github.com/orochibraru/localassistant/sdk/go"
)

type tasmota struct {
	client *http.Client
}

func (plugin tasmota) Add(context *localassistant.Context, values localassistant.Values) (localassistant.FoundDevice, error) {
	host, _ := values["host"].(string)
	return localassistant.FoundDevice{Kind: "tasmota-go-plug", ExternalID: host, Host: localassistant.String(host)}, nil
}

func (plugin tasmota) Read(context *localassistant.Context, device localassistant.Device) (any, error) {
	return plugin.power(device, "Power")
}

func (plugin tasmota) Command(context *localassistant.Context, device localassistant.Device, command localassistant.Command) (any, error) {
	if command.Type != "switch" || command.On == nil {
		return nil, fmt.Errorf("a plug only turns on and off")
	}
	if *command.On {
		return plugin.power(device, "Power On")
	}
	return plugin.power(device, "Power Off")
}

func (plugin tasmota) power(device localassistant.Device, command string) (localassistant.SwitchState, error) {
	if device.Host == nil {
		return localassistant.SwitchState{}, fmt.Errorf("this plug has no address")
	}
	response, err := plugin.client.Get(fmt.Sprintf("http://%s/cm?cmnd=%s", *device.Host, url.QueryEscape(command)))
	if err != nil {
		return localassistant.SwitchState{}, fmt.Errorf("the plug can't be reached: check its address")
	}
	defer response.Body.Close()
	var answer struct {
		Power string `json:"POWER"`
	}
	if err := json.NewDecoder(response.Body).Decode(&answer); err != nil {
		return localassistant.SwitchState{}, fmt.Errorf("the plug answered something that isn't Tasmota")
	}
	return localassistant.SwitchState{Type: "switch", On: localassistant.Bool(answer.Power == "ON")}, nil
}

func main() {
	localassistant.Run(tasmota{client: &http.Client{Timeout: 10 * time.Second}})
}
