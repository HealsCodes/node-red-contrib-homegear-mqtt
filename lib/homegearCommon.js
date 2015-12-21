/* Copyright (c) 2015 René Köcher
 * See the file LICENSE for copying permission.
 */

/* return a list of all parameter names and channels that should be
 * received via MQTT */
function readableParamsForDevice(device) {
	var res = [];

	if(device.read !== undefined) {
		device.read.forEach(function(param) {
			res.push({name: param.name.split('.').pop(), channel: param.channel});
		});
	}
	return res;
}

/* return the writable parameter list (as-is) */
function writeableParamsForDevice(device) {
	return device.write || [];
}

/* Populate and return a dictionary for a given devices readable parameters.
 * All values will be initialized to `null`. */
function payloadDictForDevice(device) {
	var res = {};

	if(device.read !== undefined) {
		device.read.forEach(function(param){
			if(param.name.match(/\./) !== null) {
				/* parameter in namespace */
				var ns = param.name.split('.')[0].toLowerCase();
				var pn = param.name.split('.')[1].toLowerCase();

				res[ns] = res[ns] || {};
				res[ns][pn] = null;
			} else {
				/* simple parameter */
				res[param.name.toLowerCase()] = null;
			}
		});
	}
	return res;
}

/* Check if a payload dictionary is "complete" e.g. contains no `null` values */
function payloadIsComplete(payload) {
	var keys = Object.keys(payload);
	for(var i in keys) {
		if(keys.hasOwnProperty(i)) {
			if(payload[keys[i]] === null) {
				return false;
			}
			if(typeof payload[keys[i]] === 'object') {
				if(payloadIsComplete(payload[keys[i]]) === false) {
					return false;
				}
			}
		}
	}
	return true;
}

/* Given a device, payload dict, mqtt topic path and value update
 * payload to include the value change described by the topic. */
function updatePayload(device, payload, path, value) {
	var parts = path.split('/');

	if(parts.length != 6 || device.read === undefined) {
		return false;
	}

	var channel = parts[4];
	var target = parts[5];

	for(var i in device.read) {
		if(device.read.hasOwnProperty(i)) {
			var param = device.read[i];

			if(param.channel == channel &&
			   param.name.split('.').pop() == target) {
				var np = param.name.split('.');

				if(param.mapping !== undefined && typeof value === 'number') {
					value = param.mapping[value] || value;
				}

				if(np.length == 2) {
					payload[np[0].toLowerCase()][np[1].toLowerCase()] = value;
				} else {
					payload[np[0].toLowerCase()] = value;
				}
				return true;
			}
		}
	}
	return false;
}

try {
	/* regular module definition */
	module.exports = {
		/* access to parameter definition */
		readableParamsForDevice: readableParamsForDevice,
		writeableParamsForDevice: writeableParamsForDevice,

		/* payload related functions */
		payloadDictForDevice: payloadDictForDevice,
		payloadIsComplete: payloadIsComplete,
		updatePayload: updatePayload
	};
} catch(_) {

	try {
		/* this variant is used by homegear-mqtt.html */
		homegear = {
			/* access to parameter definition */
			readableParamsForDevice: readableParamsForDevice,
			writeableParamsForDevice: writeableParamsForDevice,

			/* payload related functions */
			payloadDictForDevice: payloadDictForDevice,
			payloadIsComplete: payloadIsComplete,
			updatePayload: updatePayload
		};
	} catch(__){ }
}

/* vim: ts=4 sts=4 sw=4 noet :
 */
