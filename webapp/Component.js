sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/base/Log",
	"./model/models",
	"./model/Presenter",
	"./sim/Engine"
], function (UIComponent, Log, models, Presenter, Engine) {
	"use strict";

	var SPEEDS = [1, 5, 10];

	function readParameters() {
		var oParams = new URLSearchParams(window.location.search);
		var mResult = {};
		if (oParams.has("wc-seed")) {
			mResult.seed = parseInt(oParams.get("wc-seed"), 10);
		}
		if (oParams.has("wc-exceptions")) {
			mResult.exceptionRate = Math.min(1, Math.max(0, parseFloat(oParams.get("wc-exceptions"))));
		}
		if (oParams.has("wc-speed")) {
			mResult.speed = parseInt(oParams.get("wc-speed"), 10);
		}
		if (oParams.has("wc-paused")) {
			mResult.paused = oParams.get("wc-paused") !== "false";
		}
		return mResult;
	}

	return UIComponent.extend("mindtek.warehouse.cockpit.Component", {
		metadata: {
			manifest: "json",
			interfaces: ["sap.ui.core.IAsyncContentCreation"]
		},

		/**
		 * Component data (optional, used by the tests):
		 * <code>{simulation: {seed, exceptionRate, startTime, warmupSeconds, speed, paused}}</code>.
		 * The URL parameters <code>wc-seed</code>, <code>wc-exceptions</code>, <code>wc-speed</code>
		 * and <code>wc-paused</code> override it.
		 */
		init: function () {
			// Created first so the root view can wait on it even if it is instantiated during super.init.
			this._pReady = new Promise(function (fnResolve) {
				this._fnReady = fnResolve;
			}.bind(this));

			UIComponent.prototype.init.apply(this, arguments);

			var mSettings = Object.assign({}, (this.getComponentData() || {}).simulation, readParameters());
			this._oEngine = Engine.create(mSettings);
			this._mPlayback = {
				speed: SPEEDS.indexOf(mSettings.speed) >= 0 ? mSettings.speed : 1,
				live: !mSettings.paused
			};

			this.setModel(models.createDeviceModel(), "device");
			this.setModel(models.createAppModel());

			var that = this;
			Promise.resolve(this.getModel("i18n").getResourceBundle()).then(function (oBundle) {
				that._oPresenter = new Presenter(that._oEngine, oBundle);
				that._fnReady();
				// The cockpit controller attaches its routes while this creates its view,
				// which is before the matched event.
				that.getRouter().initialize();
			}).catch(function (oError) {
				Log.error(oError.message, oError.stack, "mindtek.warehouse.cockpit.Component");
			});
		},

		/**
		 * @returns {mindtek.warehouse.cockpit.sim.Engine} The simulation of this component
		 */
		getSimulation: function () {
			return this._oEngine;
		},

		/**
		 * @returns {mindtek.warehouse.cockpit.model.Presenter} Formats the simulation for the views
		 */
		getPresenter: function () {
			return this._oPresenter;
		},

		/**
		 * @returns {{speed: int, live: boolean}} Initial playback settings
		 */
		getPlayback: function () {
			return this._mPlayback;
		},

		/**
		 * @returns {Promise} Resolves when the texts are loaded and the router runs
		 */
		ready: function () {
			return this._pReady;
		},

		destroy: function () {
			if (this._oPresenter) {
				this._oPresenter.destroy();
			}
			UIComponent.prototype.destroy.apply(this, arguments);
		}
	});
});
