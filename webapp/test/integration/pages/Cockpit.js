sap.ui.define([
	"sap/ui/test/Opa5",
	"sap/ui/test/actions/Press",
	"sap/ui/test/matchers/PropertyStrictEquals"
], function (Opa5, Press, PropertyStrictEquals) {
	"use strict";

	var sView = "Cockpit";

	Opa5.createPageObjects({
		onTheCockpit: {
			actions: {
				iPressCreateWave: function () {
					return this.waitFor({
						id: "createWaveButton",
						viewName: sView,
						actions: new Press()
					});
				},

				iSelectTheFirstDeliveries: function () {
					return this.waitFor({
						id: "createWaveTable",
						viewName: sView,
						success: function (oTable) {
							oTable.getItems().slice(0, 2).forEach(function (oItem) {
								oTable.setSelectedItem(oItem, true);
							});
							oTable.fireSelectionChange({
								listItems: oTable.getSelectedItems(),
								selected: true
							});
						}
					});
				},

				iConfirmCreate: function () {
					return this.waitFor({
						id: "createWaveConfirm",
						viewName: sView,
						matchers: new PropertyStrictEquals({ name: "enabled", value: true }),
						actions: new Press()
					});
				},

				iReleaseTheWave: function () {
					return this.waitFor({
						id: "releaseWave",
						viewName: sView,
						actions: new Press()
					});
				},

				iConfirmTheDialog: function () {
					return this.waitFor({
						controlType: "sap.m.Button",
						searchOpenDialogs: true,
						matchers: new PropertyStrictEquals({ name: "text", value: "OK" }),
						actions: new Press()
					});
				}
			},

			assertions: {
				iSeeTheEmptyWaveError: function () {
					return this.waitFor({
						id: "createWaveMessages",
						viewName: sView,
						check: function (oMessageView) {
							return oMessageView.getItems().length > 0;
						},
						success: function (oMessageView) {
							Opa5.assert.strictEqual(oMessageView.getItems()[0].getType(), "Error", "An empty wave is rejected");
						}
					});
				},

				iSeeAPreview: function () {
					return this.waitFor({
						id: "previewTasks",
						viewName: sView,
						success: function (oNumber) {
							Opa5.assert.ok(parseInt(oNumber.getNumber(), 10) > 0, "The preview has pick tasks");
						}
					});
				},

				iSeeTheWaveReleased: function () {
					return this.waitFor({
						id: "waveStatus",
						viewName: sView,
						matchers: new PropertyStrictEquals({ name: "text", value: "Released" }),
						success: function () {
							Opa5.assert.ok(true, "The wave is released");
						}
					});
				}
			}
		}
	});
});
