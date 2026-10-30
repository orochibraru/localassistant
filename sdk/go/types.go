package localassistant

import (
	"encoding/json"
	"strings"
)

// Values holds what an admin typed in a plugin's form, by field name.
type Values map[string]any

// Device is a device as the host hands it to a plugin, its secrets decrypted.
type Device struct {
	ID         string            `json:"id"`
	Kind       string            `json:"kind"`
	Name       string            `json:"name"`
	ExternalID string            `json:"externalId"`
	Host       *string           `json:"host"`
	HomeID     *string           `json:"homeId"`
	RoomID     *string           `json:"roomId"`
	Fields     Values            `json:"fields"`
	State      json.RawMessage   `json:"state"`
	StateAt    *string           `json:"stateAt"`
	Secrets    map[string]string `json:"secrets"`
}

// Secret returns the decrypted secret field name of the device, or an empty string.
func (device Device) Secret(name string) string {
	return device.Secrets[name]
}

// Field returns the plain field name of the device as a string, or an empty string.
func (device Device) Field(name string) string {
	value, ok := device.Fields[name].(string)
	if !ok {
		return ""
	}
	return value
}

// FoundDevice is a device a plugin discovered or built from its form.
type FoundDevice struct {
	Kind       string  `json:"kind"`
	ExternalID string  `json:"externalId"`
	Name       string  `json:"name,omitempty"`
	Host       *string `json:"host,omitempty"`
	Fields     Values  `json:"fields,omitempty"`
	State      any     `json:"state,omitempty"`
}

// CoverMove is either an action (open, close, stop) or a position from 0 to 100.
type CoverMove struct {
	Action   string   `json:"action,omitempty"`
	Position *float64 `json:"position,omitempty"`
}

// Command is what a person asked a device to do; Type says which of the other fields is set.
type Command struct {
	Type   string          `json:"type"`
	Move   *CoverMove      `json:"move,omitempty"`
	Change json.RawMessage `json:"change,omitempty"`
	Target *float64        `json:"target,omitempty"`
	On     *bool           `json:"on,omitempty"`
	Locked *bool           `json:"locked,omitempty"`
}

// ClimateChange is a climate command's change.
type ClimateChange struct {
	Power             *bool    `json:"power,omitempty"`
	Mode              *string  `json:"mode,omitempty"`
	TargetTemperature *float64 `json:"targetTemperature,omitempty"`
	HotWaterBoost     *bool    `json:"hotWaterBoost,omitempty"`
}

// CoverState is what a blind, curtain or shutter reports.
type CoverState struct {
	Type     string   `json:"type"`
	Position *float64 `json:"position"`
}

// ClimateState is what a heat pump or air conditioner reports.
type ClimateState struct {
	Type              string   `json:"type"`
	Power             bool     `json:"power"`
	Mode              *string  `json:"mode"`
	Modes             []string `json:"modes"`
	TargetTemperature *float64 `json:"targetTemperature"`
	RoomTemperature   *float64 `json:"roomTemperature"`
	MinTemperature    float64  `json:"minTemperature"`
	MaxTemperature    float64  `json:"maxTemperature"`
	Offline           bool     `json:"offline"`
}

// SwitchState is what a relay or plug reports.
type SwitchState struct {
	Type   string   `json:"type"`
	On     *bool    `json:"on"`
	Power  *float64 `json:"power"`
	Energy *float64 `json:"energy"`
}

// MeterState is what an energy meter reports, power in watts and energy in kWh.
type MeterState struct {
	Type   string   `json:"type"`
	Power  *float64 `json:"power"`
	Energy *float64 `json:"energy"`
}

// ContactState is what a door or window sensor reports.
type ContactState struct {
	Type    string   `json:"type"`
	Open    *bool    `json:"open"`
	Battery *float64 `json:"battery"`
}

// ValveState is what a radiator valve reports.
type ValveState struct {
	Type        string   `json:"type"`
	Target      *float64 `json:"target"`
	Temperature *float64 `json:"temperature"`
	Battery     *float64 `json:"battery"`
	Setpoint    string   `json:"setpoint"`
	Min         float64  `json:"min"`
	Max         float64  `json:"max"`
	HeldBy      *string  `json:"heldBy"`
	HeldTarget  *float64 `json:"heldTarget"`
}

// LightColor is a hue in degrees and a saturation from 0 to 100.
type LightColor struct {
	Hue        float64 `json:"hue"`
	Saturation float64 `json:"saturation"`
}

// LightState is what a light reports; Features lists brightness, temperature and color when it has them.
type LightState struct {
	Type           string      `json:"type"`
	On             *bool       `json:"on"`
	Brightness     *float64    `json:"brightness"`
	Temperature    *float64    `json:"temperature"`
	MinTemperature float64     `json:"minTemperature"`
	MaxTemperature float64     `json:"maxTemperature"`
	Color          *LightColor `json:"color"`
	Features       []string    `json:"features"`
}

// LightChange is a light command's change.
type LightChange struct {
	On          *bool       `json:"on,omitempty"`
	Brightness  *float64    `json:"brightness,omitempty"`
	Temperature *float64    `json:"temperature,omitempty"`
	Color       *LightColor `json:"color,omitempty"`
}

// LockState is what a door lock reports.
type LockState struct {
	Type    string   `json:"type"`
	Locked  *bool    `json:"locked"`
	Jammed  bool     `json:"jammed"`
	Battery *float64 `json:"battery"`
}

// FanState is what a fan reports, its speed from 0 to 100 in SpeedSteps steps.
type FanState struct {
	Type        string   `json:"type"`
	On          *bool    `json:"on"`
	Speed       *float64 `json:"speed"`
	SpeedSteps  int      `json:"speedSteps"`
	Oscillating *bool    `json:"oscillating"`
}

// FanChange is a fan command's change.
type FanChange struct {
	On          *bool    `json:"on,omitempty"`
	Speed       *float64 `json:"speed,omitempty"`
	Oscillating *bool    `json:"oscillating,omitempty"`
}

// MediaState is what a speaker or TV reports; Playback is playing, paused or idle.
type MediaState struct {
	Type     string   `json:"type"`
	Power    *bool    `json:"power"`
	Playback *string  `json:"playback"`
	Title    *string  `json:"title"`
	Artist   *string  `json:"artist"`
	Volume   *float64 `json:"volume"`
	Muted    *bool    `json:"muted"`
	Source   *string  `json:"source"`
	Sources  []string `json:"sources"`
}

// MediaChange is a media command's change; Action is play, pause, next, previous or stop.
type MediaChange struct {
	Power  *bool    `json:"power,omitempty"`
	Action *string  `json:"action,omitempty"`
	Volume *float64 `json:"volume,omitempty"`
	Muted  *bool    `json:"muted,omitempty"`
	Source *string  `json:"source,omitempty"`
}

// SensorReading is one named value a sensor reports, with its unit when it has one.
type SensorReading struct {
	Name  string  `json:"name"`
	Value any     `json:"value"`
	Unit  *string `json:"unit"`
}

// SensorState is what a sensor reports.
type SensorState struct {
	Type     string          `json:"type"`
	Readings []SensorReading `json:"readings"`
}

// ButtonState is what a button or scene reports: when it was last pressed.
type ButtonState struct {
	Type      string  `json:"type"`
	PressedAt *string `json:"pressedAt"`
}

// PresenceState is what a person tracker reports: home, away, or the zone it's in.
type PresenceState struct {
	Type    string   `json:"type"`
	Home    *bool    `json:"home"`
	Zone    *string  `json:"zone"`
	Battery *float64 `json:"battery"`
}

// CameraLive says where a camera's live view is, under the device's media path.
type CameraLive struct {
	Format string `json:"format"`
	Path   string `json:"path"`
}

// CameraState is what a camera reports.
type CameraState struct {
	Type            string      `json:"type"`
	Streaming       bool        `json:"streaming"`
	Recording       bool        `json:"recording"`
	LastRecordingAt *string     `json:"lastRecordingAt"`
	Source          *string     `json:"source"`
	Live            *CameraLive `json:"live"`
	Snapshot        *string     `json:"snapshot"`
}

// CameraClip is one recording or event a camera page lists.
type CameraClip struct {
	ID        string  `json:"id"`
	Label     string  `json:"label"`
	StartedAt string  `json:"startedAt"`
	Video     *string `json:"video"`
	Image     *string `json:"image"`
	Detail    *string `json:"detail"`
}

// CameraClips is the list a camera page shows under its title.
type CameraClips struct {
	Title string       `json:"title"`
	Empty string       `json:"empty"`
	Clips []CameraClip `json:"clips"`
}

// Request is a media request for a device, under /media/<device>/<path>.
type Request struct {
	Path    string            `json:"path"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
}

// Response is what a plugin answers a media request with.
type Response struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    []byte            `json:"body"`
}

// Notification is a push notification to send to the admins or to everyone.
type Notification struct {
	Title    string `json:"title"`
	Body     string `json:"body"`
	URL      string `json:"url,omitempty"`
	Audience string `json:"audience"`
}

// Reading is one stored energy counter reading.
type Reading struct {
	Hour  string  `json:"hour"`
	Total float64 `json:"total"`
}

// Float returns a pointer to value, for the optional numbers in states.
func Float(value float64) *float64 {
	return &value
}

// Bool returns a pointer to value, for the optional booleans in states.
func Bool(value bool) *bool {
	return &value
}

// String returns a pointer to value, for the optional strings in states.
func String(value string) *string {
	return &value
}

// RequestHeaders returns the HTTP headers in a headers field's value, one "Name: value" per line, to send with every
// request; lines that aren't headers are skipped.
func RequestHeaders(value any) map[string]string {
	headers := map[string]string{}
	text, _ := value.(string)
	for _, line := range strings.Split(text, "\n") {
		name, content, found := strings.Cut(line, ":")
		name = strings.TrimSpace(name)
		content = strings.TrimSpace(content)
		if found && name != "" && content != "" {
			headers[name] = content
		}
	}
	return headers
}
