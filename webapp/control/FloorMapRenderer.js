sap.ui.define([], function () {
	"use strict";

	/**
	 * Renderer for {@link mindtek.warehouse.cockpit.control.FloorMap}.
	 *
	 * It writes the HTML frame only: the SVG canvas, the tooltip, the legend
	 * and a hidden keyboard hint. The control builds the SVG content after
	 * rendering and updates it in place, so live data never re-renders the
	 * control.
	 *
	 * @namespace
	 */
	var FloorMapRenderer = {
		apiVersion: 2
	};

	FloorMapRenderer.render = function (oRm, oControl) {
		var sId = oControl.getId();
		oRm.openStart("div", oControl);
		oRm.class("wcFloorMap");
		if (oControl.getSimplified()) {
			oRm.class("wcFloorMap--simplified");
		}
		if (oControl.getReducedMotion()) {
			oRm.class("wcFloorMap--reducedMotion");
		}
		oRm.style("width", oControl.getWidth());
		oRm.style("height", oControl.getHeight());
		oRm.openEnd();

		oRm.openStart("div", sId + "-canvas");
		oRm.class("wcFloorMapCanvas");
		oRm.openEnd();
		oRm.close("div");

		oRm.openStart("div", sId + "-tooltip");
		oRm.class("wcFloorMapTooltip");
		oRm.attr("role", "tooltip");
		oRm.attr("aria-hidden", "true");
		oRm.openEnd();
		oRm.close("div");

		oRm.openStart("div", sId + "-legend");
		oRm.class("wcFloorMapLegend");
		oRm.openEnd();
		oRm.close("div");

		oRm.openStart("span", sId + "-hint");
		oRm.class("sapUiInvisibleText");
		oRm.openEnd();
		oRm.text(oControl.getKeyboardHint());
		oRm.close("span");

		oRm.close("div");
	};

	return FloorMapRenderer;
});
