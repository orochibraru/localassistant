# Cameras

## Cameras with RTSP

Any camera with a local RTSP stream: a Tapo with a camera account set in its
app, a Reolink, most ONVIF cameras. **Devices**, **Cameras (RTSP)** under
**Integrations**, **Add the camera** with its RTSP address (stored encrypted).

The worker runs one ffmpeg per camera. It copies the video as it comes, without
re-encoding, into a short live stream for the camera's page and, with **Record
on the server** on, into five-minute MP4 files kept for the days you choose.
Files live next to the database, in `plugin-data/camera/<device id>/recordings`
inside the data volume, and are only served to signed-in people. Recordings from
before plugins sit in the old `cameras/` folder: move each camera's files there
by hand to keep them. A 1080p camera fills roughly 20 GB a day; size the volume
and the retention together.

The camera page plays the live view and lists recordings by day. The Docker
image ships ffmpeg; running the binaries yourself needs it on the `PATH`.

## Frigate

With a [Frigate](https://frigate.video/) NVR, connect it instead: **Devices**,
**Frigate** under **Integrations**, with its internal address (port 5000) and
the labels to be told about (`person` by default). Its cameras come in as
devices; their pages show Frigate's live view and its events, each playing its
clip. Frigate records; LocalAssistant only proxies its pictures and clips to
signed-in people.

With the MQTT broker connected (see [Zigbee and Shelly](zigbee)), a new
detection of one of those labels pushes a notification to everyone, once every
five minutes per camera and label.

## The printer's camera

A Bambu Lab P1 or A1 card has a camera button: it shows a picture from the
printer every two seconds while open. Turn on **LAN mode liveview** in the
printer's settings.
