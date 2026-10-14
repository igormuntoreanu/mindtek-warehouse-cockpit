sap.ui.define([
	"sap/ui/test/opaQunit",
	"./OpaConfig",
	"./pages/Cockpit"
], function (opaTest) {
	"use strict";

	QUnit.module("Wave release");

	opaTest("A planner sees why an empty wave is rejected, then creates and releases one", function (Given, When, Then) {
		Given.iStartMyUIComponent({
			componentConfig: {
				name: "mindtek.warehouse.cockpit",
				id: "warehouseCockpit",
				componentData: {
					simulation: { paused: true, exceptionRate: 0 }
				}
			},
			hash: "",
			autoWait: false
		});

		When.onTheCockpit.iPressCreateWave();
		Then.onTheCockpit.iSeeTheEmptyWaveError();

		When.onTheCockpit.iSelectTheFirstDeliveries();
		Then.onTheCockpit.iSeeAPreview();

		When.onTheCockpit.iConfirmCreate();
		When.onTheCockpit.iReleaseTheWave();
		When.onTheCockpit.iConfirmTheDialog();
		Then.onTheCockpit.iSeeTheWaveReleased();

		Then.iTeardownMyUIComponent();
	});
});
