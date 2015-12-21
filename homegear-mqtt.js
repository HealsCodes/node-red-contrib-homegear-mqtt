/* Copyright (c) 2015 René Köcher
 * See the file LICENSE for copying permission.
 */
module.exports = function(RED) {
	"use strict";

	var fs = require('fs');
	var path = require('path');
	var clone = require('clone');

	var homegear = require('./lib/homegearCommon');

	/* FIXME: this needs work if there's to be support for multiple families. */
	var devspecs = JSON.parse(fs.readFileSync(path.join(__dirname,'families', 'homematic.json')));

	function HomegearMqttInNode(n) {
		RED.nodes.createNode(this, n);

		this.broker = n.broker;
		this.brokerConn = RED.nodes.getNode(this.broker);
		this.peerId = n.peerId;
		this.homegearId = n.homegearId;
		this.deviceType = devspecs[Number((n.deviceType || '0:0').split(':')[0])];
		this.deviceState = homegear.payloadDictForDevice(this.deviceType);
		this.publishUpdates = n.publishUpdates;
		this.publishComplete = n.publishComplete;


		this.eventTopic = 'homegear/' + this.homegearId + '/event/' + this.peerId + '/#';
		this.rpcTopic   = 'homegear/' + this.homegearId + '/rpcResult';
		this.rpcId      = Math.floor(1 + Math.random() * 7295);

		var node = this;

		function processMqttPayload(topic, payload) {
			var oldState = null;
			if(node.publishUpdates === true) {
				/* need something to compare against */
				oldState = clone(node.deviceState);
			}
			if(homegear.updatePayload(node.deviceType, node.deviceState, topic, payload)) {
				if(node.publishComplete === true) {
					if(homegear.payloadIsComplete(node.deviceState) === false) {
						/* state is incomplete and we only publish complete states */
						return;
					}
				}
				if(node.publishUpdates === true) {
					if(RED.util.compareObjects(oldState, node.deviceState) === true) {
						/* we only publish updates and there has been no change */
						return;
					}
				}
				/* good to send */
				node.send({topic: node.name, payload: node.deviceState});
			}
			oldState = null;
		}

		if(this.brokerConn && this.deviceType){
			this.status({fill:'red', shape:'ring', text:"node-red:common.status.disconnected"});

			node.log('subscribing to topic "' + node.eventTopic + '"');
			this.brokerConn.subscribe(node.eventTopic, 2, function(topic, payload, packet) {
				payload = JSON.parse(payload.toString())[0];
				processMqttPayload(topic, payload);
			}, this.id);

			/* temporarily subscript to rpc responses */
			node.log('subscribing to topic "' + node.rpcTopic + '"');
			this.brokerConn.subscribe(node.rpcTopic, 2, function(topic, payload, packet) {
				payload = JSON.parse(payload.toString());

				if(payload.id === undefined || payload.id != node.rpcId) {
					return;
				}

				node.log('received initial parameter values');
				payload.result[0].CHANNELS.forEach(function(channel){
					for(var name in channel.PARAMSET){
						if(channel.PARAMSET.hasOwnProperty(name)) {
							var param = channel.PARAMSET[name];
							var eventTopic = node.eventTopic.replace('/#', '/' + channel.INDEX + '/' + name);

							processMqttPayload(eventTopic, param.VALUE);
						}
					}
				});

				node.log('unsubscribing from topic "' + node.rpcTopic + '"');
				node.brokerConn.unsubscribe(node.rpcTopic, node.id);
			}, this.id);

			if(this.brokerConn.connected) {
				node.status({fill:'blue', shape:'dot', text:"node-red:common.status.connected"});
			}
			node.brokerConn.register(this);

			/* request the current state of this devices parameter set */
			node.brokerConn.publish({
				topic: 'homegear/' + node.homegearId + '/rpc',
				qos: 2,
				retain: false,
				payload: {
					method: 'getAllValues',
					params: [ node.peerId ],
					id: node.rpcId
				}
			});
		}

		this.on('close', function() {
			if(node.brokerConn) {
				node.brokerConn.unsubscribe(node.evenTopic,node.id);
				node.brokerConn.unsubscribe(node.rpcTopic,node.id);
				node.brokerConn.deregister(node);
			}
		});
	}
	RED.nodes.registerType('homegear-mqtt in', HomegearMqttInNode);

	function HomegearMqttOutNode(n) {
		RED.nodes.createNode(this, n);

		this.broker        = n.broker;
		this.brokerConn    = RED.nodes.getNode(this.broker);
		this.peerId        = n.peerId;
		this.homegearId    = n.homegearId;
		this.deviceType    = devspecs[Number((n.deviceType || '0:0').split(':')[0])];
		this.deviceParams  = homegear.writeableParamsForDevice(this.deviceType);
		this.paramName     = n.paramName;
		this.paramValue    = n.paramValue;
		this.publishResult = n.publishResult;

		this.rpcTopic      = 'homegear/' + this.homegearId + '/rpcResult';
		this.rpcId         = Math.floor(1 + Math.random() * 7295);

		var node = this;

		if(this.brokerConn && this.deviceType){
			this.status({fill:'red', shape:'ring', text:"node-red:common.status.disconnected"});

			if(this.publishResult === true) {
				node.log('subscribing to topic "' + node.rpcTopic + '"');
				this.brokerConn.subscribe(node.eventTopic, 2, function(topic, payload, packet) {
					payload = JSON.parse(payload.toString());

					if(payload.result !== undefined) {
						node.send({payload: payload.result[0]});
					}
				}, this.id);
			}

			if(this.brokerConn.connected) {
				node.status({fill:'blue', shape:'dot', text:"node-red:common.status.connected"});
			}
			node.brokerConn.register(this);
		}

		this.on('input', function(input) {
			var msg = {
				topic: 'homegear/' + node.homegearId + '/rpc',
				qos: 2,
				retain: false,
				payload: {
					method: 'setValue',
					params: [ node.peerId ],
					id: node.rpcId
				}
			};

			var paramName = input.name || node.paramName;
			var paramValue = input.value || node.paramValue;

			this.deviceParams.forEach(function(param){
				if(param.name === paramName) {
					msg.payload.params.push(param.channel);
					msg.payload.params.push(param.name.split('.').pop());

					if(param.type === 'string') {
						msg.payload.params.push(paramValue.toString());
					} else if(param.type === 'action') {
						msg.payload.params.push(Boolean(paramValue));
					} else {
						msg.payload.params.push(Number(paramValue));
					}
				}
			});

			if(msg.payload.params.length != 4){
				node.error('"' + paramName + '" did not match any supported parameter');
			} else {
				node.brokerConn.publish(msg);
			}
		});

		this.on('close', function() {
			if(node.brokerConn) {
				node.brokerConn.unsubscribe(node.rpcTopic,node.id);
				node.brokerConn.deregister(node);
			}
		});
	}
	RED.nodes.registerType('homegear-mqtt out', HomegearMqttOutNode);


	RED.httpAdmin.get('/homegear-mqtt/families/:familyName', function(req, res){
		var filename = path.join(__dirname , 'families', req.params.familyName + '.json');
		res.sendFile(filename);
	 });

	RED.httpAdmin.get('/homegear-mqtt/common', function(req, res){
		var filename = path.join(__dirname , 'lib', 'homegearCommon.js');
		res.sendFile(filename);
	});
}

/* vim: ts=4 sw=4 sts=4 noet :
 */
