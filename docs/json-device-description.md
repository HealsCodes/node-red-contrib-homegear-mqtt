JSON device description files
=============================
node-red-contrib-homegear-mqtt uses JSON files to describe devices and device families.
The whole file is just a JSON array of device descriptions (see next section).

**NOTE**: Currently only **Homematic** devices are supported since their parameter sets are well documented and available in XML format from the [Open CCU SDK](http://www.eq-3.de/Downloads/Software/Software_Development_Kit/HM-OCCU-SDK-1.0.0.tgz).

### Device description format ###
The following JSON syntax is used to describe a single device type:

```json
{
	"names" : [ "supported-device-1", "supported-device-2", "..." ],
	"read"  : [
		{
			"name"    : "NAMESPACE.PARAM_NAME",
			"channel" : 1,
			"mapping" : [
				"OPTION_0",
				"OPTION_1"
			]
		},
	],
	"write" : [
		{
			"name"    : "NAMESPACE.PARAM_NAME_1",
			"channel" : 1,
			"type"    : "integer" | "float" | "string" | "boolean" | "action",
		},
		{
			"name"    : "NAMESPACE.PARAM_NAME_1",
			"channel" : 1,
			"type"    : "option",
			"mapping" : [
				"OPTION_0",
				"OPTION_1"
			]
		}
	]
}
```

The fields have the following purpose:

* *names* - a list of names this device is known as
* *read* - a list of readable device values (basically everything with `event` access):
    * *name* - the parameters name, either in the form `NAME` or, if not unique, as `NAMESPACE.NAME` (e.g. `KEY_1.PRESS`).
    * *channel* - the channel this value will be reported on
    * *mapping* [optional] - if the value contains a mappable status code *mapping* can hold a list of human readable string values

* *write* - a list of writeable device values:
    * *name* - the parameters name, either in the form `NAME` or, if not unique as `NAMESPACE.NAME` (e.g. `KEY_1.PRESS`).
    * *channel* - the channel this value has to be submitted to
    * *type* - the parameter type - any of `integer`, `float`, `string`, `boolean`, `action` or `option`
    * *mapping* [optional] - if *type* is `option` this should contain a list of valid values to choose from

Namespaces are used to separate parameters with identical names (for example the keys on a remote which will all have a PRESS action) and are also used to group parameters in the status report created by `homegear-mqtt in`-nodes.

A names like `KEY_1.PRESS`, `KEY_1.PRESS_SHORT` ,`KEY_2.PRESS`, `KEY_2.PRESS_SHORT` will result in a **msg.payload** of:

```json
{
    "key_1": {
        "press" : 0,
        "press_short" : 0
    },
    "key_2": {
        "press" : 0,
        "press_short" : 0
    }
}
```

##### Determining parameter names and channel by listening to Homegear #####
Some of the keys required above can be determined by directly listening to Homegear via MQTT (for example using `mosquitto_sub`). Homegear will publish events under the topic `homegear/+/event/#`.

A status event typically looks like this:

	(msg.topic): homegear/xxx/event/aaa/bbb/CCC
	                      |         |   |   \----------- variable / parameter name
	                      |         |   +--------------- channel number
	                      |         +------------------- peer id for this device
	                      +----------------------------- unique homegear id as defined in /etc/homegear/mqtt.conf

The events payload is a JSON array containing the current value as its only element.

