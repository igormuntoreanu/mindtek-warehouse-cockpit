sap.ui.define([
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/BindingMode",
	"sap/ui/Device"
], function (JSONModel, BindingMode, Device) {
	"use strict";

	return {
		createDeviceModel: function () {
			var oModel = new JSONModel(Device);
			oModel.setDefaultBindingMode(BindingMode.OneWay);
			return oModel;
		},

		/**
		 * The cockpit's view model. The controller fills it from the simulation.
		 */
		createAppModel: function () {
			var oModel = new JSONModel({
				playback: "live",
				speed: "1",
				clock: { time: "", date: "" },
				kpis: {},
				layout: "desktop",
				reducedMotion: false,
				view: "map",
				layers: {
					bins: true,
					workers: true,
					docks: true,
					paths: true,
					heatMap: false
				},
				zoom: 1,
				selectedKey: "",
				panel: {
					visible: true,
					page: "waves",
					waveFilter: "all"
				},
				waves: [],
				waveCounts: { all: 0, active: 0, planned: 0, completed: 0 },
				objects: [],
				objectFilter: "all",
				wave: {
					exceptions: [],
					deliveries: [],
					tasks: [],
					log: [],
					openExceptionCount: 0,
					canRelease: false,
					progress: 0
				},
				bin: { history: [], movements: [], hasException: false, fill: 0 },
				dock: { deliveries: [], pallets: [], hasTruck: false, inbound: false, fill: 0 },
				worker: { queue: [], picker: false, productivityPercent: 0 },
				create: {
					strategy: "DUE",
					deliveries: [],
					deliveryCount: 0,
					selectedCount: 0,
					canCreate: false,
					preview: {
						messages: [],
						taskCount: "0",
						unitCount: "0",
						durationValue: "0",
						workersNeeded: "0",
						idleText: ""
					}
				},
				resolve: {
					exceptionId: "",
					title: "",
					description: "",
					deliveryText: "",
					alternatives: [],
					hasAlternatives: false,
					binId: "",
					option: 1
				}
			});
			oModel.setSizeLimit(1000);
			return oModel;
		}
	};
});
