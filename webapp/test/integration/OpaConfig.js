sap.ui.define([
	"sap/ui/test/Opa5"
], function (Opa5) {
	"use strict";

	Opa5.extendConfig({
		// UI5 schedules requestAnimationFrame for resize and rendering. A press
		// action always consults the auto waiter, and that waiter treats those
		// frames as an animation. The simulation itself is paused in the journey.
		autoWait: {
			jsAnimationWaiter: {
				enabled: false
			}
		},
		timeout: 30,
		viewNamespace: "mindtek.warehouse.cockpit.view."
	});
});
