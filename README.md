node-red-contrib-homegear-mqtt
===============================
Monitor and control your devices connect to [Homegear](https://www.homegear.eu) from [Node-RED](https://nodered.org).

[![npm version](https://badge.fury.io/js/node-red-contrib-homegear-mqtt.svg)](http://badge.fury.io/js/node-red-contrib-homegear-mqtt) [![Build Status](https://travis-ci.org/Shirk/node-red-contrib-homegear-mqtt.svg?branch=master)](https://travis-ci.org/Shirk/node-red-contrib-homegear-mqtt) [![Coverage Status](https://coveralls.io/repos/Shirk/node-red-contrib-homegear-mqtt/badge.svg?branch=master&service=github)](https://coveralls.io/github/Shirk/node-red-contrib-homegear-mqtt?branch=master)[![Dependency Status](https://david-dm.org/shirk/node-red-contrib-homegear-mqtt.svg)](https://david-dm.org/shirk/noder-red-contrib-homegear-mqtt)

### Overview
node-red-contrib-homegear-mqtt interfaces with your [Homegear](https://www.homegear.eu) server using *MQTT*
and provides nodes for monitoring the published variables of your devices as well as changing their values and
triggering actions.

**Currently only the Homematic device family is supported but inclusion of MAX!, INSTEON an maybe even Hue
is planned. However takes some time to write the required [JSON device descriptions](https://github.com/shirk/node-red-contrib-homegear-mqtt/blob/master/docs/json-device-description.md) so please bear with me.**

### Installation
Per user:
```bash
cd ~/.node-red
npm install node-red-contrib-homegear-mqtt
```

Globaly:
```bash
sudo npm install -g --unsafe-perms node-red-contrib-homegear-mqtt
```

### Requirements ###
node-red-contrib-homegear-mqtt uses *MQTT* and Homegears *JSON-RPC* interface.

Both are available in [Homegear](https://www.homegear.eu) version *0.6 or later*.
As of the date of this writing (December 2015) this requires the snapshot versions of [Homegear](https://www.homegear.eu).

Make sure to set `enable = true` inside Homegears `/etc/homegear/mqtt.conf`.

### TODOs ###
Things that are planned but not implemented (yet):
- [ ] refactor broker & homegearId to a separate config node
     (requires: https://github.com/node-red/node-red/issues/636)
- [ ] add support for familie selection
- [ ] add families for MAX!, INSTEON and maybe Hue (need to test that one)

### Contributing ###

    1. Fork the project
    2. Create a feature branch
    3. Code
    4. Submit pull request to `master`

