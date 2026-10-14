sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/core/Fragment",
	"sap/m/MessageToast",
	"sap/m/MessageBox"
], function (BaseObject, Fragment, MessageToast, MessageBox) {
	"use strict";

	/**
	 * Resolves a short pick or blocked bin: pick the rest from another bin or
	 * ship the delivery short.
	 *
	 * @alias mindtek.warehouse.cockpit.controller.ResolveDialog
	 */
	return BaseObject.extend("mindtek.warehouse.cockpit.controller.ResolveDialog", {
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
		 * @param {string} sExceptionId Open exception
		 * @returns {Promise} Resolves when the dialog is open
		 */
		open: function (sExceptionId) {
			var that = this;
			this._oModel.setProperty("/resolve", this._oCockpit.getPresenter().resolveData(sExceptionId));
			if (!this._pDialog) {
				this._pDialog = Fragment.load({
					id: this._oView.getId(),
					name: "mindtek.warehouse.cockpit.view.fragment.ResolveException",
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

		onResolve: function () {
			var oPresenter = this._oCockpit.getPresenter();
			var oData = this._oModel.getProperty("/resolve");
			var bAlternative = oData.option === 0 && oData.hasAlternatives;
			var oResult;
			try {
				oResult = this._oCockpit.getSimulation().resolveException(oData.exceptionId,
					bAlternative ? { action: "alternative", binId: oData.binId } : { action: "skip" });
			} catch (oError) {
				MessageBox.error(oPresenter.text(oError.message));
				return;
			}
			this._oView.byId("resolveDialog").close();
			MessageToast.show(bAlternative ?
				oPresenter.text("toastResolvedAlternative", [oResult.qty, oData.binId, oPresenter.workerName(oResult.workerId)]) :
				oPresenter.text("toastResolvedSkip"));
			this._oCockpit.refresh();
		},

		onCancel: function () {
			this._oView.byId("resolveDialog").close();
		},

		onAfterClose: function () {
			this._oModel.setProperty("/resolve", null);
		}
	});
});
