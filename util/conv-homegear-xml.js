#!/bin/env node
/* Copyright (c) 2016 René Köcher
 * See the file LICENSE for copying permission.
 */

var fs = require('fs');

try {
	var xml2js  = require('xml2js');
} catch(e) {
	console.error('Could not require xml2js, make sure it is installed.');
	process.exit(1);
}

if(process.argv.length < 4 || process.argv[2].match(/\.json$/) === null) {
	console.error('usage: convert-homegear-xml.js outfile.json desc.xml [desc.xml [...]]');
	console.error('Use this script to convert Homegear XML device descriptions to JSON.');
	process.exit(1);
}

function collectDeviceNames(device) {
	var res;
	device.supportedDevices[0].device.forEach(function(type){
		res = res || [];
		res.push(type.$.id);
	});
	return res;
}

function collectChannels(device) {
	var res;
	var channelTypes = [];

	device.functions[0].function.forEach(function(fn){
		// 1st run, collect channel types by name
		if(Array.isArray(fn.variables) && fn.variables.length >= 1) {
			if(fn.$.type === 'MAINTENANCE') {
				return;
			}

			channelTypes[fn.$.type] = channelTypes[fn.$.type] || [];
			for(var i = 0; i < parseInt(fn.$.channelCount); ++i) {
				channelTypes[fn.$.type].push(parseInt(fn.$.channel) + i);
			}
		}
	});

	device.functions[0].function.forEach(function(fn){
		if(Array.isArray(fn.variables) && fn.variables.length >= 1) {
			if(fn.$.type === 'MAINTENANCE') {
				return;
			}

			res = res || [];

			var channelIndex;
			if(parseInt(fn.$.channelCount || '1') === 1) {
				var p = {
					'name'  : fn.$.type,
					'values': fn.variables[0],
					'channel': parseInt(fn.$.channel)
				};

				if(channelTypes[fn.$.type].length !== 1) {
					// not unique, need to include the index
					channelIndex = channelTypes[fn.$.type].indexOf(parseInt(fn.$.channel)) + 1;
					p.name += '_' + channelIndex;
				}

				res.push(p);
			} else {
				for(var i = 0; i < parseInt(fn.$.channelCount); ++i) {
					channelIndex = channelTypes[fn.$.type].indexOf(parseInt(fn.$.channel) + i) + 1;
					res.push({
						'name'   : fn.$.type + '_' + channelIndex,
						'values' : fn.variables[0],
						'channel': parseInt(fn.$.channel) + i
					});
				}
			}
		}
	});
	return res;
}

function collectParamMapping(logicalEnum) {
	var res = [];
	var maxIndex = 0;
	logicalEnum.value.forEach(function(value){
		var index = parseInt(value.index[0]);

		res[index] = value.id[0];
		maxIndex = (index > maxIndex) ? index : maxIndex;
	});

	// fill empty slots
	for(var i = 0; i <= maxIndex; ++i) {
		if(res[i] === undefined) {
			res[i] = '';
		}
	}
	return res;
}

function collectParams(device, channels, type) {
	var res;

	var paramNames = [];
	var nameCollisions = false;

	channels.forEach(function(channel){
		device.parameterGroups[0].variables.forEach(function(vardef){
			if(vardef.$.id !== channel.values ||
			   vardef.parameter === undefined) {
				return;
			}
			vardef.parameter.forEach(function(param){
				var p = {
					name: channel.name + '.' + param.$.id,
					channel: channel.channel
				};

				if(type === 'event') {
					if(param.properties[0].readable === false ||
					   param.packets === undefined) {
						// not readable at all
						return;
					}

					// check if there is packet for events
					var hasEvents = false;
					param.packets[0].packet.forEach(function(packet){
						//if(packet.$.id === 'INFO_LEVEL' &&
						if(packet.type[0] === 'event') {
							hasEvents = true;
						}
					});

					if(hasEvents === false) {
						return;
					}

				} else if(type === 'write') {
					if(param.properties[0].writeable === false ||
					   param.packets === undefined) {
						// not writeable at all
						return;
					}

					var isSettable = false;
					param.packets[0].packet.forEach(function(packet){
						if(packet.type[0] === 'set') {
							isSettable = true;
						}
					});

					if(isSettable === false){
						return;
					}

					if(param.logicalAction !== undefined) {
						p.type = 'action'
					} else if(param.logicalDecimal !== undefined) {
						p.type = 'float'
					} else if(param.logicalInteger !== undefined) {
						p.type = 'integer'
					} else if(param.logicalBoolean !== undefined) {
						p.type = 'boolean'
					} else if(param.logicalString  !== undefined) {
						p.type = 'string'
					} else if(param.logicalEnumeration !== undefined) {
						p.type = 'integer';
					}
				}

				if(param.logicalEnumeration !== undefined) {
					p.mapping = collectParamMapping(param.logicalEnumeration[0]);
				}

				if(paramNames.indexOf(param.$.id) !== -1) {
					nameCollisions = true;
				} else {
					paramNames.push(param.$.id);
				}
				res = res || [];
				res.push(p);
			});
		});
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

		var device     = result.homegearDevice;
		var localSpecs = [];

		(collectDeviceNames(device) || []).forEach(function(name){
			var spec = {};

			if(names.indexOf(name) != -1) {
				console.log(' - device "' + name + '" already known, skipping.');
				return;
			}
			names.push(name);

			console.log(' - found device "' + name + '"');
			var channelDefs = collectChannels(device, name);
			if(channelDefs !== undefined) {
				spec.read  = collectParams(device, channelDefs, 'event');
				spec.write = collectParams(device, channelDefs, 'write');


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

/* vim: ft=javascript sw=4 ts=4 noet :
 */
