#!/bin/env node
/* Copyright (c) 2015 René Köcher
 * See the file LICENSE for copying permission.
 */

var fs = require('fs');

try {
	var xml2js  = require('xml2js');
} catch(e) {
	console.error('Could not require xml2js, make sure it is installed.');
	process.exit(1);
}

if(process.argv.length < 4 || process.argv[2].endsWith('.json') === false) {
	console.error('usage: convert-bidcosxml.js outfile.json desc.xml [desc.xml [...]]');
	console.error('Use this script to convert HMOCCU XML descriptions to JSON.');
	console.error('(XML files may be found inside the rftypes/ directory inside the SDK)');
	process.exit(1);
}

function collectDeviceNames(device) {
	var res;
	device.supported_types[0].type.forEach(function(type){
		res = res || [];
		res.push(type.$.id);
	});
	return res;
}

/* Some (read: many) devices don't supply a channel count but rather require
 * the CCU to read the count from the online device - we can't do that here.
 * This method tries different heuristics to guess the correct channel count
 * from the devices human readable name. */
function guessChannelCountFromName(device, name) {
	var channelCount = null;
	device.supported_types[0].type.forEach(function(type){
		if(type.$.id === name) {
			channelHint = type.$.name.match(/ (\d+)[ -](buttons|single buttons|switches|channel)/i);
			if(channelHint !== null) {
				channelCount = Number(channelHint[1]);
			} else {
				channelHint = type.$.name.match(/(button|remote) (\d+)/i);
				if(channelHint !== null) {
					channelCount = Number(channelHint[2]);
				} else {
					channelHint = type.$.name.match(/[ -]?(button|contact|switch|sensor)[ -]?/i);
					channelCount = (channelHint !== null) ? 1 : null;
				}
			}

			if(channelCount !== null) {
				console.log('  -> guessed: ' + channelCount + ' (from "' + channelHint[0] + '")');
			}
		}
	});

	return channelCount || -1
}

/* try to collect all channels defined for a given device */
function collectChannels(device, name) {
	var res;
	var unsupported = false;
	device.channels[0].channel.forEach(function(channel){
		var channels = Number(channel.$.count || 1);

		if(channel.$.count === undefined &&
		   channel.$.count_from_sysinfo !== undefined) {
			console.log('  - channel type "' + channel.$.type + '" has no fixed channel count.');
			channels = guessChannelCountFromName(device, name);
			if(channels == -1) {
				console.error('  -! could not determine channel count => skipping device.');
				unsupported = true;
				return;
			}
		}

		res = res || [];

		var total = Number(channel.$.index) + channels;
		for(var i = Number(channel.$.index); i < total; ++i) {
			res.push(channel.$.type + ((channels > 1) ? '_' + i : ''));
		}
	});
	return unsupported ? undefined : res;
}

function channelNamed(device, channelName) {
	var res;
	device.channels[0].channel.forEach(function(channel){
		if(channel.$.type === channelName) {
			res = channel;
		}
	});
	return res;
}

/* Some channels don't include their parameter description directly but refer
 * to a 'valueset' in the same file. This method tries to look up the the
 * 'valueset' for a given channel name and returns it's parameter definition. */
function parametersFromValuesetForChannel(device, channelName) {
	var res;
	var baseName = channelName.replace(/_\d+$/, '').toLowerCase();

	if(device.paramset_defs !== undefined &&
	   device.paramset_defs[0].paramset !== undefined) {
		device.paramset_defs[0].paramset.forEach(function(paramset){
			if(paramset.$.id === baseName + '_valueset') {
				res = paramset.parameter;
			}
		});
	}
	return res;
}

/* Return all defined values for a given device & channel */
function parametersForChannel(device, channelName) {
	var paramset, res;
	var baseName = channelName.replace(/_\d+$/, '');
	var channel  = channelNamed(device, baseName);

	if(channel !== undefined) {
		channel.paramset.forEach(function(ps){
			if(ps.$.type === 'VALUES') {
				if(ps.parameter === undefined){
					/* some specs place the values in a separate paramset */
					res = parametersFromValuesetForChannel(device, baseName);
				} else {
					res = ps.parameter;
				}
			}
		});
	}
	return res;
}

/* Collect all parameters of a given type (currently 'event' for read and
 * 'write' for write parameters). */
function collectParams(device, channels, accessType) {
	var res;
	var paramNames = [];
	var nameCollisions = false;

	channels.forEach(function(channel){
		if(channel === 'MAINTENANCE') {
			return;
		}

		var params = parametersForChannel(device, channel);
		if(params !== undefined) {
			params.forEach(function(param){
				var accessTypes = param.$.operations.split(',').map(function(n){ return n.trim(); });

				if(accessTypes.indexOf(accessType) != -1) {
					if(paramNames.indexOf(param.$.id) != -1) {
						nameCollisions = true;
					} else {
						paramNames.push(param.$.id);
					}

					var p = {
						name: channel + '.' + param.$.id,
						channel: channels.indexOf(channel),
						type: accessType !== 'event' ? param.logical[0].$.type : undefined
					};

					if(param.logical[0].$.type === 'option' ) {
						/* add a mapping list */
						p.mapping = [];
						param.logical[0].option.forEach(function(option){
							p.mapping.push(option.$.id);
						});
					}
					res = res || [];
					res.push(p);
				}
			});
		}
	});

	/* if no name collisions where detected simply the
	 * parameter structure by dropping the channel name */
	if(res !== undefined && nameCollisions === false) {
		console.log('  - using simplified parameter structure..');
		for(var i in res) {
			if(res.hasOwnProperty(i)) {
				res[i].name = res[i].name.split('.').pop();
			}
		}
	}

	return res;
}

var parser = new xml2js.Parser();

var specs = [];
var names = [];
var unsupported = [];


console.time('Conversion took       '); // keep tabs
console.log('------- starting conversion ----------');

process.argv.slice(3).forEach(function(filename){
	var data = fs.readFileSync(filename);
	if(data === undefined || data === null) {
		console.error('Could not read ' + filename);
		process.exit(2);
	}

	console.log('- parsing ' + filename);

	parser.parseString(data, function(err, result){
		if(result === undefined) {
			console.error(err);
			process.exit(3);
		}

		var device      = result.device;
		var localSpecs = [];

		(collectDeviceNames(device) || []).forEach(function(name){
			var spec = {};

			if(names.indexOf(name) != -1) {
				console.log(' - device "' + name + '" already known, skipping.');
				return;
			}
			names.push(name);

			console.log(' - found device "' + name + '"');
			var channelNames = collectChannels(device, name);
			if(channelNames !== undefined) {
				spec.read  = collectParams(device, channelNames, 'event');
				spec.write = collectParams(device, channelNames, 'write');


				var mergeWith = null;
				localSpecs.forEach(function(local_spec){
					spec.names = local_spec.names;
					if(JSON.stringify(spec) == JSON.stringify(local_spec)) {
						mergeWith = local_spec;
					}
				});

				if(mergeWith !== null){
					mergeWith.names.push(name);
				}
				else {
					spec.names = [name];
					localSpecs.push(spec);
				}
			} else {
				unsupported.push(filename);
			}
		});
		specs = specs.concat(localSpecs);
	});
});

console.log('\n- writing ' + process.argv[2] + ' ..')
fs.writeFileSync(process.argv[2], JSON.stringify(specs, null, 2) + '\n');

console.log('\n------- conversion finished ----------');
console.log('Input files           : ' + process.argv.slice(2).length);
console.log('Unique device types   : ' + names.length);
console.log('Unique device specs   : ' + specs.length);
console.log('Unknown channel count : ' + unsupported.length);
console.timeEnd('Conversion took       ');

//unsupported.forEach(function(name){ console.log('- ' + name);});

/* vim: ft=javascript sw=4 ts=4 noet :
 */
