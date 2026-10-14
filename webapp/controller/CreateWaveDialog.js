sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/core/Fragment",
	"sap/m/MessageToast",
	"sap/m/MessageBox"
], function (BaseObject, Fragment, MessageToast, MessageBox) {
	"use strict";

	/**
	 * Create-wave dialog: pick open deliveries and a strategy, check the preview
	 * and create a planned wave.
	 *
	 * @alias mindtek.warehouse.cockpit.controller.CreateWaveDialog
	 */
	return BaseObject.extend("mindtek.warehouse.cockpit.controller.CreateWaveDialog", {
		/**
		 * @param {mindtek.warehouse.cockpit.controller.Cockpit} oCockpit Owning controller
		 */
		constructor: function (oCockpit) {
			BaseObject.call(this);
			this._oCockpit = oCockpit;
			this._oView = oCockpit.getView();
			this._oModel = oCockpit.getOwnerComponent().getModel();
		},

		/**
		 * @param {string[]} [aSelectedIds] Deliveries to select initially
		 * @returns {Promise} Resolves when the dialog is open
		 */
		open: function (aSelectedIds) {
			var that = this;
			this._prepare(aSelectedIds);
			if (!this._pDialog) {
				this._pDialog = Fragment.load({
					id: this._oView.getId(),
					name: "mindtek.warehouse.cockpit.view.fragment.CreateWave",
					controller: this
				}).then(function (oDialog) {
					that._oView.addDependent(oDialog);
					return oDialog;
				});
			}
			return this._pDialog.then(function (oDialog) {
				oDialog.open();
			});
		},

		_prepare: function (aSelectedIds) {
			var aDeliveries = this._oCockpit.getPresenter().openDeliveries(aSelectedIds);
			this._oModel.setProperty("/create", {
				strategy: "DUE",
				deliveries: aDeliveries,
				deliveryCount: aDeliveries.length,
				selectedCount: 0,
				canCreate: false,
				preview: { messages: [], taskCount: "0", unitCount: "0", durationValue: "0", workersNeeded: "0", idleText: "" }
			});
			this._updatePreview();
		},

		_selectedIds: function () {
			return (this._oModel.getProperty("/create/deliveries") || []).filter(function (oDelivery) {
				return oDelivery.selected;
			}).map(function (oDelivery) {
				return oDelivery.id;
			});
		},

		_updatePreview: function () {
			var aIds = this._selectedIds();
			var sStrategy = this._oModel.getProperty("/create/strategy");
			var oPreview = this._oCockpit.getSimulation().previewWave(aIds, sStrategy);
			this._oModel.setProperty("/create/selectedCount", aIds.length);
			this._oModel.setProperty("/create/canCreate", !oPreview.hasErrors);
			this._oModel.setProperty("/create/preview", this._oCockpit.getPresenter().preview(oPreview));
		},

		onSelectionChange: function (oEvent) {
			// The two-way "selected" binding can lag the event, so the table is the source of truth.
			var mSelected = {};
			oEvent.getSource().getSelectedContexts().forEach(function (oContext) {
				mSelected[oContext.getPath()] = true;
			});
			(this._oModel.getProperty("/create/deliveries") || []).forEach(function (oDelivery, iIndex) {
				oDelivery.selected = !!mSelected["/create/deliveries/" + iIndex];
			});
			this._updatePreview();
		},

		onStrategyChange: function () {
			this._updatePreview();
		},

		onCreate: function () {
			var oPresenter = this._oCockpit.getPresenter();
			var oWave;
			try {
				oWave = this._oCockpit.getSimulation().createWave(this._selectedIds(), this._oModel.getProperty("/create/strategy"));
			} catch (oError) {
				MessageBox.error(oPresenter.text(oError.message));
				this._updatePreview();
				return;
			}
			this._oView.byId("createWaveDialog").close();
			MessageToast.show(oPresenter.text("toastWaveCreated", [oWave.id, oWave.taskIds.length]));
			this._oCockpit.refresh();
			this._oCockpit.showWave(oWave.id);
		},

		onCancel: function () {
			this._oView.byId("createWaveDialog").close();
		},

		onAfterClose: function () {
			this._oModel.setProperty("/create", null);
		}
	});
});
