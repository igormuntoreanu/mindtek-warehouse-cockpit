sap.ui.define([
	"sap/ui/core/Control",
	"./FloorMapRenderer"
], function (Control, FloorMapRenderer) {
	"use strict";

	var SVG_NS = "http://www.w3.org/2000/svg";
	var MIN_ZOOM = 1;
	var MAX_ZOOM = 6;
	var ZOOM_STEP = 1.4;
	var MARGIN_X = 15;
	var MARGIN_Y = 2;
	var DRAG_THRESHOLD = 4;
	var REDUCED_MOTION_INTERVAL = 1000;
	var LABEL_ZOOM = 1.6;
	var HEAT_BUCKETS = 5;

	var LEGEND = {
		fill: ["empty", "low", "ok", "full", "exception"],
		heat: ["heatLow", "heatHigh"],
		docks: ["free", "occupied", "loading"],
		workers: ["walking", "picking", "idle"]
	};

	function svg(sTag, mAttributes, oParent) {
		var oElement = document.createElementNS(SVG_NS, sTag);
		Object.keys(mAttributes || {}).forEach(function (sName) {
			oElement.setAttribute(sName, mAttributes[sName]);
		});
		if (oParent) {
			oParent.appendChild(oElement);
		}
		return oElement;
	}

	function round(fValue) {
		return Math.round(fValue * 100) / 100;
	}

	function setClass(oElement, sClass) {
		if (oElement.getAttribute("class") !== sClass) {
			oElement.setAttribute("class", sClass);
		}
	}

	function setAttr(oElement, sName, sValue) {
		if (oElement.getAttribute(sName) !== String(sValue)) {
			oElement.setAttribute(sName, sValue);
		}
	}

	/**
	 * Warehouse floor map rendered as SVG, without third-party libraries.
	 *
	 * <h3>Data</h3>
	 * <ul>
	 * <li><code>layout</code>: static geometry in metres (zones, aisles, bins, docks, stations,
	 * staging, cross aisles). Changing it re-renders the control.</li>
	 * <li><code>bins</code>, <code>docks</code> and <code>workers</code>: live state, keyed by
	 * <code>id</code>. Setting them updates the SVG in place and never re-renders, so they can be
	 * pushed every animation frame (workers) or a few times per second (bins, docks).</li>
	 * </ul>
	 * Every live entry can carry an <code>ariaLabel</code> and a <code>tooltip</code>
	 * (<code>{title: string, rows: [{label, value}]}</code>), so the texts stay in the app's i18n.
	 *
	 * <h3>Interaction</h3>
	 * Hover or focus shows the tooltip; click, Enter or Space fires <code>select</code>.
	 * Bins, docks and workers are focusable with a roving tab index; the arrow keys move to the
	 * nearest object in that direction, Home and End jump to the first and last object, + and -
	 * zoom, 0 fits the map and Escape clears the selection. Ctrl or Cmd with the mouse wheel zooms
	 * around the pointer, and dragging pans a zoomed map.
	 *
	 * @extends sap.ui.core.Control
	 * @alias mindtek.warehouse.cockpit.control.FloorMap
	 */
	var FloorMap = Control.extend("mindtek.warehouse.cockpit.control.FloorMap", {
		metadata: {
			properties: {
				/** Width of the control. */
				width: { type: "sap.ui.core.CSSSize", defaultValue: "100%" },
				/** Height of the control. */
				height: { type: "sap.ui.core.CSSSize", defaultValue: "100%" },
				/** Static floor geometry in metres; see the class description. */
				layout: { type: "object", defaultValue: null },
				/** Live bin state: <code>[{id, state: "empty"|"low"|"ok"|"full"|"exception", heat: 0..1, planned, ariaLabel, tooltip}]</code>. */
				bins: { type: "object[]", defaultValue: [] },
				/** Live dock state: <code>[{id, state: "free"|"occupied"|"loading", fill: 0..1, ariaLabel, tooltip}]</code>. */
				docks: { type: "object[]", defaultValue: [] },
				/** Live workers: <code>[{id, type: "picker"|"forklift", x, y, status, statusText, initials, path: [{x, y}], ariaLabel, tooltip}]</code>. */
				workers: { type: "object[]", defaultValue: [] },
				/** Show the bins layer. */
				showBins: { type: "boolean", defaultValue: true },
				/** Show the workers layer. */
				showWorkers: { type: "boolean", defaultValue: true },
				/** Show the docks layer. */
				showDocks: { type: "boolean", defaultValue: true },
				/** Show the remaining route of every worker and outline the bins with open picks. */
				showPaths: { type: "boolean", defaultValue: true },
				/** Colour bins by pick frequency instead of fill level. */
				heatMap: { type: "boolean", defaultValue: false },
				/** Zoom factor; 1 fits the whole floor. */
				zoom: { type: "float", defaultValue: 1 },
				/** Key (id) of the selected bin, dock or worker. */
				selectedKey: { type: "string", defaultValue: "" },
				/** Move workers in discrete steps once a second instead of animating them. */
				reducedMotion: { type: "boolean", defaultValue: false },
				/** Phone view: aisles instead of single bins, no labels and no routes. */
				simplified: { type: "boolean", defaultValue: false },
				/** Hidden instructions announced with the map. */
				keyboardHint: { type: "string", defaultValue: "" },
				/** Accessible role description of the map. */
				roleDescription: { type: "string", defaultValue: "" }
			},
			aggregations: {
				/**
				 * Legend texts. The key is one of: empty, low, ok, full, exception (fill level),
				 * heatLow, heatHigh (heat map), free, occupied, loading (docks), walking, picking, idle (workers).
				 */
				legendItems: { type: "sap.ui.core.Item", multiple: true, singularName: "legendItem" }
			},
			associations: {
				/** Controls that label the map. */
				ariaLabelledBy: { type: "sap.ui.core.Control", multiple: true, singularName: "ariaLabelledBy" }
			},
			events: {
				/** Fired when the user selects an object, or clears the selection with Escape. */
				select: {
					parameters: {
						/** Id of the object, empty when the selection is cleared. */
						key: { type: "string" },
						/** "bin", "dock", "worker" or empty. */
						type: { type: "string" }
					}
				},
				/** Fired after the zoom factor changes through user interaction or the zoom methods. */
				zoomChange: {
					parameters: {
						zoom: { type: "float" }
					}
				}
			}
		},

		renderer: FloorMapRenderer
	});

	FloorMap.prototype.init = function () {
		this._mItems = {};
		this._aItems = [];
		this._mState = {};
		this._sFocusKey = "";
		this._sTooltipKey = "";
		this._oCentre = null;
		this._iLastWorkerUpdate = 0;
		this._fnPointerMove = this._onPointerMove.bind(this);
		this._fnPointerUp = this._onPointerUp.bind(this);
	};

	FloorMap.prototype.exit = function () {
		this._detachDrag();
	};

	/* ------------------------------------------------------------------ */
	/* Setters that update in place                                         */
	/* ------------------------------------------------------------------ */

	FloorMap.prototype.setBins = function (aBins) {
		this.setProperty("bins", aBins || [], true);
		this._updateBins();
		return this;
	};

	FloorMap.prototype.setDocks = function (aDocks) {
		this.setProperty("docks", aDocks || [], true);
		this._updateDocks();
		return this;
	};

	FloorMap.prototype.setWorkers = function (aWorkers) {
		this.setProperty("workers", aWorkers || [], true);
		if (this.getReducedMotion()) {
			var iNow = Date.now();
			if (iNow - this._iLastWorkerUpdate < REDUCED_MOTION_INTERVAL) {
				return this;
			}
			this._iLastWorkerUpdate = iNow;
		}
		this._updateWorkers();
		return this;
	};

	["showBins", "showWorkers", "showDocks", "showPaths", "heatMap"].forEach(function (sName) {
		var sSetter = "set" + sName.charAt(0).toUpperCase() + sName.slice(1);
		FloorMap.prototype[sSetter] = function (bValue) {
			this.setProperty(sName, bValue, true);
			this._applyLayers();
			return this;
		};
	});

	FloorMap.prototype.setZoom = function (fZoom) {
		var fValue = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fZoom || 1));
		this.setProperty("zoom", fValue, true);
		this._applyViewBox();
		return this;
	};

	FloorMap.prototype.setSelectedKey = function (sKey) {
		this.setProperty("selectedKey", sKey || "", true);
		this._updateSelection();
		return this;
	};

	FloorMap.prototype.setReducedMotion = function (bValue) {
		this.setProperty("reducedMotion", bValue, true);
		this.toggleStyleClass("wcFloorMap--reducedMotion", !!bValue);
		return this;
	};

	/* ------------------------------------------------------------------ */
	/* Public methods                                                       */
	/* ------------------------------------------------------------------ */

	/** Zooms in one step around the centre of the view. */
	FloorMap.prototype.zoomIn = function () {
		this._zoomTo(this.getZoom() * ZOOM_STEP);
	};

	/** Zooms out one step around the centre of the view. */
	FloorMap.prototype.zoomOut = function () {
		this._zoomTo(this.getZoom() / ZOOM_STEP);
	};

	/** Shows the whole floor. */
	FloorMap.prototype.fitToScreen = function () {
		this._oCentre = null;
		this._zoomTo(1);
	};

	/**
	 * Moves the keyboard focus to an object.
	 *
	 * @param {string} sKey Id of a bin, dock or worker
	 */
	FloorMap.prototype.focusItem = function (sKey) {
		var oItem = this._mItems[sKey];
		if (oItem && this._isNavigable(oItem)) {
			this._setFocusKey(sKey);
			oItem.el.focus();
		}
	};

	/* ------------------------------------------------------------------ */
	/* Building the SVG                                                     */
	/* ------------------------------------------------------------------ */

	FloorMap.prototype.onBeforeRendering = function () {
		this._detachDrag();
	};

	FloorMap.prototype.onAfterRendering = function () {
		var oLayout = this.getLayout();
		this._mItems = {};
		this._aItems = [];
		this._mState = {};
		if (!oLayout) {
			return;
		}
		this._oExtent = {
			x: -MARGIN_X,
			y: -MARGIN_Y,
			width: oLayout.width + 2 * MARGIN_X,
			height: oLayout.height + 2 * MARGIN_Y
		};
		this._buildSvg(oLayout);
		this._applyViewBox();
		this._applyLayers();
		this._updateBins();
		this._updateDocks();
		this._updateWorkers();
		this._updateSelection();
		this._updateLegend();
	};

	FloorMap.prototype._buildSvg = function (oLayout) {
		var that = this;
		var oCanvas = this.getDomRef("canvas");
		var bSimplified = this.getSimplified();
		var aLabelIds = this.getAriaLabelledBy().concat(this.getId() + "-hint");
		var oSvg = svg("svg", {
			"class": "wcMapSvg",
			preserveAspectRatio: "xMidYMid meet",
			role: "group",
			"aria-labelledby": aLabelIds.join(" "),
			focusable: "false"
		});
		if (this.getRoleDescription()) {
			oSvg.setAttribute("aria-roledescription", this.getRoleDescription());
		}
		this._oSvg = oSvg;

		var oFloor = svg("g", { "class": "wcLayerFloor", "aria-hidden": "true" }, oSvg);
		svg("rect", { "class": "wcBuilding", x: 0, y: 0, width: oLayout.width, height: oLayout.height, rx: 0.8 }, oFloor);
		oLayout.zones.forEach(function (oZone) {
			svg("rect", {
				"class": "wcZone wcZone--" + oZone.key,
				x: oZone.x, y: oZone.y, width: oZone.width, height: oZone.height
			}, oFloor);
			var oText = svg("text", { "class": "wcZoneLabel", x: oZone.x + 1.4, y: 3.6 }, oFloor);
			oText.textContent = oZone.label || oZone.id;
		});
		oLayout.crossAisles.forEach(function (oLane) {
			svg("rect", { "class": "wcLane", x: oLane.x, y: oLane.y, width: oLane.width, height: oLane.height }, oFloor);
			svg("line", {
				"class": "wcLaneLine",
				x1: oLane.x + 1, y1: oLane.y + oLane.height / 2,
				x2: oLane.x + oLane.width - 1, y2: oLane.y + oLane.height / 2
			}, oFloor);
		});
		oLayout.aisles.forEach(function (oAisle) {
			svg("rect", { "class": "wcAisle", x: oAisle.x, y: oAisle.y, width: oAisle.width, height: oAisle.height }, oFloor);
			var oText = svg("text", { "class": "wcAisleLabel", x: oAisle.centreX, y: oAisle.y - 0.4 }, oFloor);
			oText.textContent = oAisle.id;
		});
		oLayout.stations.forEach(function (oStation) {
			svg("rect", {
				"class": "wcStation", x: oStation.x, y: oStation.y, width: oStation.width, height: oStation.height, rx: 0.6
			}, oFloor);
			var oText = svg("text", { "class": "wcStationLabel", x: oStation.x + oStation.width / 2, y: oStation.y + oStation.height / 2 + 0.6 }, oFloor);
			oText.textContent = oStation.label || oStation.id;
		});
		oLayout.staging.forEach(function (oLane) {
			svg("rect", {
				"class": "wcStaging", x: oLane.x, y: oLane.y, width: oLane.width, height: oLane.height, rx: 0.4
			}, oFloor);
		});

		this._oBinLayer = svg("g", { "class": "wcLayerBins" }, oSvg);
		if (bSimplified) {
			this._oBinLayer.setAttribute("aria-hidden", "true");
			this._buildAisleBlocks(oLayout);
		} else {
			oLayout.bins.forEach(function (oBin) {
				var oGroup = that._createItem(that._oBinLayer, oBin.id, "bin", oBin.x + oBin.width / 2, oBin.y + oBin.height / 2);
				that._mItems[oBin.id].rect = svg("rect", {
					"class": "wcBinRect",
					x: oBin.x + 0.15, y: oBin.y + 0.1, width: oBin.width - 0.3, height: oBin.height - 0.2, rx: 0.35
				}, oGroup);
				that._mItems[oBin.id].box = { x: oBin.x, y: oBin.y, width: oBin.width, height: oBin.height };
			});
		}

		this._oDockLayer = svg("g", { "class": "wcLayerDocks" }, oSvg);
		oLayout.docks.forEach(function (oDock) {
			that._buildDock(oDock, oLayout);
		});

		this._oPathLayer = svg("g", { "class": "wcLayerPaths", "aria-hidden": "true" }, oSvg);
		this._oWorkerLayer = svg("g", { "class": "wcLayerWorkers" }, oSvg);
		this._oSelectionRing = svg("rect", { "class": "wcSelectionRing", visibility: "hidden", rx: 0.8 }, oSvg);
		this._oFocusRing = svg("rect", { "class": "wcFocusRing", visibility: "hidden", rx: 0.8 }, oSvg);

		oSvg.addEventListener("pointerover", this._onPointerOver.bind(this));
		oSvg.addEventListener("pointerout", this._onPointerOut.bind(this));
		oSvg.addEventListener("pointerdown", this._onPointerDown.bind(this));
		oSvg.addEventListener("wheel", this._onWheel.bind(this), { passive: false });
		oSvg.addEventListener("keydown", this._onKeyDown.bind(this));
		oSvg.addEventListener("focusin", this._onFocusIn.bind(this));
		oSvg.addEventListener("focusout", this._onFocusOut.bind(this));
		oCanvas.appendChild(oSvg);
	};

	FloorMap.prototype._buildAisleBlocks = function (oLayout) {
		var that = this;
		this._mAisleBlocks = {};
		oLayout.aisles.forEach(function (oAisle) {
			["L", "R"].forEach(function (sSide) {
				var x = sSide === "L" ? oAisle.rackX : oAisle.rackX + 7;
				that._mAisleBlocks[oAisle.id + sSide] = svg("rect", {
					"class": "wcBinRect wcBin--ok",
					x: x + 0.15, y: oAisle.y + 1, width: 2.7, height: oAisle.height - 1.6, rx: 0.4
				}, that._oBinLayer);
			});
		});
		this._mBinAisle = {};
		oLayout.bins.forEach(function (oBin) {
			that._mBinAisle[oBin.id] = oBin.aisleId + oBin.side;
		});
	};

	FloorMap.prototype._buildDock = function (oDock, oLayout) {
		var bInbound = oDock.direction === "inbound";
		var fCentreY = oDock.y + oDock.height / 2;
		var fTrailerX = bInbound ? -10.6 : oLayout.width + 1.2;
		var fCabX = bInbound ? -13.6 : oLayout.width + 10.8;
		var oGroup = this._createItem(this._oDockLayer, oDock.id, "dock", bInbound ? -5 : oLayout.width + 5, fCentreY);
		var oItem = this._mItems[oDock.id];
		oItem.box = {
			x: bInbound ? -14 : oLayout.width - 1,
			y: oDock.y - 0.6,
			width: 15,
			height: oDock.height + 1.2
		};
		oItem.door = svg("rect", { "class": "wcDoor", x: oDock.x, y: oDock.y, width: oDock.width, height: oDock.height, rx: 0.3 }, oGroup);
		var oLabel = svg("text", {
			"class": "wcDoorLabel",
			x: bInbound ? 2.2 : oLayout.width - 2.2,
			y: oDock.y - 0.6,
			"text-anchor": bInbound ? "start" : "end"
		}, oGroup);
		oLabel.textContent = oDock.label || oDock.id;
		var oTruck = svg("g", { "class": "wcTruck" }, oGroup);
		svg("rect", { "class": "wcTruckTrailer", x: fTrailerX, y: fCentreY - 3, width: 9.4, height: 6, rx: 0.4 }, oTruck);
		oItem.fill = svg("rect", { "class": "wcTruckFill", x: fTrailerX + 0.6, y: fCentreY - 2.4, width: 0, height: 4.8, rx: 0.2 }, oTruck);
		svg("rect", { "class": "wcTruckCab", x: fCabX, y: fCentreY - 2.3, width: 2.8, height: 4.6, rx: 0.6 }, oTruck);
		[-2.6, 2.6].forEach(function (fOffset) {
			svg("rect", { "class": "wcTruckWheel", x: fTrailerX + 1.2, y: fCentreY + fOffset - 0.35 + (fOffset > 0 ? 0.35 : -0.35), width: 1.8, height: 0.7, rx: 0.3 }, oTruck);
			svg("rect", { "class": "wcTruckWheel", x: fTrailerX + 6.4, y: fCentreY + fOffset - 0.35 + (fOffset > 0 ? 0.35 : -0.35), width: 1.8, height: 0.7, rx: 0.3 }, oTruck);
		});
		oItem.truck = oTruck;
		oItem.inbound = bInbound;
		oItem.trailerX = fTrailerX;
	};

	FloorMap.prototype._createItem = function (oParent, sKey, sType, fCx, fCy) {
		var oGroup = svg("g", {
			"class": "wcItem wcItem--" + sType,
			role: "button",
			tabindex: "-1",
			"data-key": sKey
		}, oParent);
		var oItem = { key: sKey, type: sType, el: oGroup, cx: fCx, cy: fCy };
		this._mItems[sKey] = oItem;
		this._aItems.push(oItem);
		return oGroup;
	};

	FloorMap.prototype._createWorker = function (oWorker) {
		var oGroup = this._createItem(this._oWorkerLayer, oWorker.id, "worker", oWorker.x, oWorker.y);
		var oItem = this._mItems[oWorker.id];
		if (oWorker.type === "forklift") {
			svg("rect", { "class": "wcWorkerBody wcWorkerBody--forklift", x: -2, y: -1.5, width: 4, height: 3, rx: 0.6 }, oGroup);
			svg("rect", { "class": "wcForks", x: 2, y: -1.1, width: 1.2, height: 0.35 }, oGroup);
			svg("rect", { "class": "wcForks", x: 2, y: 0.75, width: 1.2, height: 0.35 }, oGroup);
		} else {
			svg("circle", { "class": "wcWorkerBody wcWorkerBody--picker", r: 1.7 }, oGroup);
		}
		var oInitials = svg("text", { "class": "wcWorkerInitials", y: 0.5 }, oGroup);
		oInitials.textContent = oWorker.initials || "";
		oItem.dot = svg("circle", { "class": "wcStatusDot", cx: 1.5, cy: -1.3, r: 0.75 }, oGroup);
		oItem.label = svg("text", { "class": "wcWorkerStatus", y: 3.3 }, oGroup);
		oItem.path = svg("polyline", { "class": "wcPath", points: "" }, this._oPathLayer);
		oItem.box = { x: -2.6, y: -2.6, width: 5.2, height: 5.2, relative: true };
		return oItem;
	};

	/* ------------------------------------------------------------------ */
	/* Live updates                                                         */
	/* ------------------------------------------------------------------ */

	FloorMap.prototype._updateBins = function () {
		if (!this._oSvg) {
			return;
		}
		var that = this;
		var bHeat = this.getHeatMap();
		var bPaths = this.getShowPaths();
		if (this.getSimplified()) {
			this._updateAisleBlocks();
			return;
		}
		this.getBins().forEach(function (oBin) {
			var oItem = that._mItems[oBin.id];
			if (!oItem) {
				return;
			}
			that._mState[oBin.id] = oBin;
			var sClass = "wcBinRect ";
			if (bHeat && oBin.state !== "exception") {
				sClass += "wcHeat" + Math.min(HEAT_BUCKETS, 1 + Math.floor((oBin.heat || 0) * HEAT_BUCKETS));
			} else {
				sClass += "wcBin--" + oBin.state;
			}
			if (bPaths && oBin.planned) {
				sClass += " wcBin--planned";
			}
			setClass(oItem.rect, sClass);
			setAttr(oItem.el, "aria-label", oBin.ariaLabel || oBin.id);
		});
		this._refreshTooltip();
	};

	FloorMap.prototype._updateAisleBlocks = function () {
		var that = this;
		var mTotals = {};
		this.getBins().forEach(function (oBin) {
			var sBlock = that._mBinAisle[oBin.id];
			var oTotal = mTotals[sBlock] = mTotals[sBlock] || { fill: 0, count: 0, exception: false, heat: 0 };
			oTotal.fill += oBin.fill || 0;
			oTotal.heat += oBin.heat || 0;
			oTotal.count += 1;
			oTotal.exception = oTotal.exception || oBin.state === "exception";
		});
		var bHeat = this.getHeatMap();
		Object.keys(mTotals).forEach(function (sBlock) {
			var oTotal = mTotals[sBlock];
			var fFill = oTotal.fill / oTotal.count;
			var sState = oTotal.exception ? "exception" : (fFill < 0.25 ? "low" : (fFill > 0.9 ? "full" : "ok"));
			var sClass = bHeat && !oTotal.exception ?
				"wcBinRect wcHeat" + Math.min(HEAT_BUCKETS, 1 + Math.floor(oTotal.heat / oTotal.count * HEAT_BUCKETS)) :
				"wcBinRect wcBin--" + sState;
			setClass(that._mAisleBlocks[sBlock], sClass);
		});
	};

	FloorMap.prototype._updateDocks = function () {
		if (!this._oSvg) {
			return;
		}
		var that = this;
		this.getDocks().forEach(function (oDock) {
			var oItem = that._mItems[oDock.id];
			if (!oItem) {
				return;
			}
			that._mState[oDock.id] = oDock;
			setClass(oItem.door, "wcDoor wcDoor--" + oDock.state);
			setClass(oItem.truck, "wcTruck" + (oDock.state === "free" ? " wcTruck--hidden" : "") + (oDock.state === "loading" ? " wcTruck--loading" : ""));
			var fWidth = round(8.2 * Math.max(0, Math.min(1, oDock.fill || 0)));
			setAttr(oItem.fill, "width", fWidth);
			setAttr(oItem.fill, "x", oItem.inbound ? round(oItem.trailerX + 0.6 + 8.2 - fWidth) : round(oItem.trailerX + 0.6));
			setAttr(oItem.el, "aria-label", oDock.ariaLabel || oDock.id);
		});
		this._refreshTooltip();
	};

	FloorMap.prototype._updateWorkers = function () {
		if (!this._oSvg) {
			return;
		}
		var that = this;
		var bLabels = !this.getSimplified() && this.getZoom() >= LABEL_ZOOM;
		var bPaths = this.getShowPaths() && !this.getSimplified();
		var sSelected = this.getSelectedKey();
		this.getWorkers().forEach(function (oWorker) {
			var oItem = that._mItems[oWorker.id] || that._createWorker(oWorker);
			that._mState[oWorker.id] = oWorker;
			oItem.cx = oWorker.x;
			oItem.cy = oWorker.y;
			setAttr(oItem.el, "transform", "translate(" + round(oWorker.x) + " " + round(oWorker.y) + ")");
			if (oItem.status !== oWorker.status) {
				oItem.status = oWorker.status;
				setClass(oItem.dot, "wcStatusDot wcStatus--" + oWorker.status);
				oItem.label.textContent = oWorker.statusText || oWorker.status;
			}
			setAttr(oItem.label, "visibility", bLabels || sSelected === oWorker.id ? "visible" : "hidden");
			setAttr(oItem.el, "aria-label", oWorker.ariaLabel || oWorker.id);
			var aPath = oWorker.path || [];
			if (bPaths && aPath.length) {
				var sPoints = round(oWorker.x) + "," + round(oWorker.y) + " " + aPath.map(function (oPoint) {
					return round(oPoint.x) + "," + round(oPoint.y);
				}).join(" ");
				setAttr(oItem.path, "points", sPoints);
				setClass(oItem.path, "wcPath" + (sSelected === oWorker.id ? " wcPath--selected" : ""));
			} else {
				setAttr(oItem.path, "points", "");
			}
		});
		if (sSelected && this._mItems[sSelected] && this._mItems[sSelected].type === "worker") {
			this._placeRing(this._oSelectionRing, this._mItems[sSelected]);
		}
		if (this._sFocusKey && this._mItems[this._sFocusKey] && this._mItems[this._sFocusKey].type === "worker" && this._bHasFocus) {
			this._placeRing(this._oFocusRing, this._mItems[this._sFocusKey]);
		}
		this._ensureTabStop();
		this._refreshTooltip();
	};

	FloorMap.prototype._placeRing = function (oRing, oItem) {
		var oBox = oItem.box;
		var x = oBox.relative ? oItem.cx + oBox.x : oBox.x;
		var y = oBox.relative ? oItem.cy + oBox.y : oBox.y;
		setAttr(oRing, "x", round(x - 0.5));
		setAttr(oRing, "y", round(y - 0.5));
		setAttr(oRing, "width", round(oBox.width + 1));
		setAttr(oRing, "height", round(oBox.height + 1));
		setAttr(oRing, "visibility", "visible");
	};

	FloorMap.prototype._updateSelection = function () {
		if (!this._oSvg) {
			return;
		}
		var sKey = this.getSelectedKey();
		var that = this;
		this._aItems.forEach(function (oItem) {
			if (oItem.key === sKey) {
				oItem.el.setAttribute("aria-current", "true");
			} else if (oItem.el.hasAttribute("aria-current")) {
				oItem.el.removeAttribute("aria-current");
			}
		});
		var oSelected = this._mItems[sKey];
		if (oSelected && this._isNavigable(oSelected)) {
			this._placeRing(this._oSelectionRing, oSelected);
			if (!this._bHasFocus) {
				this._setFocusKey(sKey);
			}
		} else {
			this._oSelectionRing.setAttribute("visibility", "hidden");
		}
		if (oSelected && oSelected.type === "worker") {
			that._updateWorkers();
		}
	};

	FloorMap.prototype._applyLayers = function () {
		if (!this._oSvg) {
			return;
		}
		this._oBinLayer.style.display = this.getShowBins() ? "" : "none";
		this._oDockLayer.style.display = this.getShowDocks() ? "" : "none";
		this._oWorkerLayer.style.display = this.getShowWorkers() ? "" : "none";
		this._oPathLayer.style.display = this.getShowPaths() && this.getShowWorkers() ? "" : "none";
		this._updateBins();
		this._updateWorkers();
		this._updateSelection();
		this._updateLegend();
		this._ensureTabStop();
	};

	FloorMap.prototype._updateLegend = function () {
		var oLegend = this.getDomRef("legend");
		if (!oLegend) {
			return;
		}
		var mTexts = {};
		this.getLegendItems().forEach(function (oItem) {
			mTexts[oItem.getKey()] = oItem.getText();
		});
		var aGroups = [];
		if (this.getShowBins()) {
			aGroups.push(this.getHeatMap() ? "heat" : "fill");
		}
		if (this.getShowDocks()) {
			aGroups.push("docks");
		}
		if (this.getShowWorkers()) {
			aGroups.push("workers");
		}
		oLegend.textContent = "";
		aGroups.forEach(function (sGroup) {
			var oList = document.createElement("ul");
			oList.className = "wcLegendGroup";
			if (sGroup === "heat") {
				var oHeat = document.createElement("li");
				oHeat.className = "wcLegendItem";
				var oLow = document.createElement("span");
				oLow.textContent = mTexts.heatLow || "";
				var oScale = document.createElement("span");
				oScale.className = "wcLegendScale";
				oScale.setAttribute("aria-hidden", "true");
				for (var i = 1; i <= HEAT_BUCKETS; i++) {
					var oStep = document.createElement("span");
					oStep.className = "wcLegendSwatch wcHeat" + i;
					oScale.appendChild(oStep);
				}
				var oHigh = document.createElement("span");
				oHigh.textContent = mTexts.heatHigh || "";
				oHeat.appendChild(oLow);
				oHeat.appendChild(oScale);
				oHeat.appendChild(oHigh);
				oList.appendChild(oHeat);
			} else {
				LEGEND[sGroup].forEach(function (sKey) {
					var oEntry = document.createElement("li");
					oEntry.className = "wcLegendItem";
					var oSwatch = document.createElement("span");
					oSwatch.setAttribute("aria-hidden", "true");
					oSwatch.className = "wcLegendSwatch wcLegend--" + sGroup + " " +
						(sGroup === "fill" ? "wcBin--" + sKey : (sGroup === "docks" ? "wcDoor--" + sKey : "wcStatus--" + sKey));
					var oText = document.createElement("span");
					oText.textContent = mTexts[sKey] || sKey;
					oEntry.appendChild(oSwatch);
					oEntry.appendChild(oText);
					oList.appendChild(oEntry);
				});
			}
			oLegend.appendChild(oList);
		});
	};

	/* ------------------------------------------------------------------ */
	/* View box, zoom and pan                                               */
	/* ------------------------------------------------------------------ */

	FloorMap.prototype._viewBox = function () {
		var oExtent = this._oExtent;
		var fZoom = this.getZoom();
		var fWidth = oExtent.width / fZoom;
		var fHeight = oExtent.height / fZoom;
		var oCentre = this._oCentre || { x: oExtent.x + oExtent.width / 2, y: oExtent.y + oExtent.height / 2 };
		var x = Math.max(oExtent.x, Math.min(oExtent.x + oExtent.width - fWidth, oCentre.x - fWidth / 2));
		var y = Math.max(oExtent.y, Math.min(oExtent.y + oExtent.height - fHeight, oCentre.y - fHeight / 2));
		this._oCentre = { x: x + fWidth / 2, y: y + fHeight / 2 };
		return { x: x, y: y, width: fWidth, height: fHeight };
	};

	FloorMap.prototype._applyViewBox = function () {
		if (!this._oSvg) {
			return;
		}
		var oBox = this._viewBox();
		this._oSvg.setAttribute("viewBox", [oBox.x, oBox.y, oBox.width, oBox.height].map(round).join(" "));
		this.toggleStyleClass("wcFloorMap--zoomed", this.getZoom() > 1.001);
		this._updateWorkers();
		this._hideTooltip();
	};

	FloorMap.prototype._zoomTo = function (fZoom, oAnchor) {
		var fOld = this.getZoom();
		var fNew = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fZoom));
		if (Math.abs(fNew - fOld) < 0.0001) {
			return;
		}
		if (oAnchor && this._oCentre) {
			var fRatio = fOld / fNew;
			this._oCentre = {
				x: oAnchor.x + (this._oCentre.x - oAnchor.x) * fRatio,
				y: oAnchor.y + (this._oCentre.y - oAnchor.y) * fRatio
			};
		}
		this.setZoom(fNew);
		this.fireZoomChange({ zoom: this.getZoom() });
	};

	FloorMap.prototype._toMap = function (iClientX, iClientY) {
		var oMatrix = this._oSvg.getScreenCTM();
		if (!oMatrix) {
			return null;
		}
		var oPoint = new DOMPoint(iClientX, iClientY).matrixTransform(oMatrix.inverse());
		return { x: oPoint.x, y: oPoint.y };
	};

	FloorMap.prototype._onWheel = function (oEvent) {
		if (!oEvent.ctrlKey && !oEvent.metaKey) {
			return;
		}
		oEvent.preventDefault();
		var oAnchor = this._toMap(oEvent.clientX, oEvent.clientY);
		this._zoomTo(this.getZoom() * (oEvent.deltaY < 0 ? 1.15 : 1 / 1.15), oAnchor);
	};

	FloorMap.prototype._onPointerDown = function (oEvent) {
		if (oEvent.button !== 0) {
			return;
		}
		var oTarget = oEvent.target.closest && oEvent.target.closest(".wcItem");
		this._oDrag = {
			x: oEvent.clientX,
			y: oEvent.clientY,
			key: oTarget ? oTarget.getAttribute("data-key") : "",
			centre: Object.assign({}, this._oCentre),
			moved: false,
			pointerId: oEvent.pointerId
		};
		document.addEventListener("pointermove", this._fnPointerMove);
		document.addEventListener("pointerup", this._fnPointerUp);
	};

	FloorMap.prototype._onPointerMove = function (oEvent) {
		var oDrag = this._oDrag;
		if (!oDrag) {
			return;
		}
		var fDx = oEvent.clientX - oDrag.x;
		var fDy = oEvent.clientY - oDrag.y;
		if (!oDrag.moved && Math.abs(fDx) + Math.abs(fDy) < DRAG_THRESHOLD) {
			return;
		}
		if (this.getZoom() <= 1.001) {
			oDrag.moved = Math.abs(fDx) + Math.abs(fDy) >= DRAG_THRESHOLD;
			return;
		}
		oDrag.moved = true;
		this.addStyleClass("wcFloorMap--panning");
		var oRect = this._oSvg.getBoundingClientRect();
		var oBox = this._viewBox();
		var fScale = Math.max(oBox.width / oRect.width, oBox.height / oRect.height);
		this._oCentre = { x: oDrag.centre.x - fDx * fScale, y: oDrag.centre.y - fDy * fScale };
		this._applyViewBox();
	};

	FloorMap.prototype._onPointerUp = function () {
		var oDrag = this._oDrag;
		this._detachDrag();
		this.removeStyleClass("wcFloorMap--panning");
		if (oDrag && !oDrag.moved && oDrag.key) {
			this._select(oDrag.key);
		}
	};

	FloorMap.prototype._detachDrag = function () {
		this._oDrag = null;
		document.removeEventListener("pointermove", this._fnPointerMove);
		document.removeEventListener("pointerup", this._fnPointerUp);
	};

	FloorMap.prototype._select = function (sKey) {
		var oItem = this._mItems[sKey];
		if (!oItem) {
			return;
		}
		this._setFocusKey(sKey);
		this.fireSelect({ key: sKey, type: oItem.type });
	};

	/* ------------------------------------------------------------------ */
	/* Tooltip                                                              */
	/* ------------------------------------------------------------------ */

	FloorMap.prototype._onPointerOver = function (oEvent) {
		var oTarget = oEvent.target.closest && oEvent.target.closest(".wcItem");
		if (oTarget && !this._oDrag) {
			this._showTooltip(oTarget.getAttribute("data-key"));
		}
	};

	FloorMap.prototype._onPointerOut = function (oEvent) {
		var oTarget = oEvent.target.closest && oEvent.target.closest(".wcItem");
		var oRelated = oEvent.relatedTarget && oEvent.relatedTarget.closest && oEvent.relatedTarget.closest(".wcItem");
		if (oTarget && oTarget !== oRelated && !this._bHasFocus) {
			this._hideTooltip();
		}
	};

	FloorMap.prototype._showTooltip = function (sKey) {
		var oTooltip = this.getDomRef("tooltip");
		var oItem = this._mItems[sKey];
		var oState = this._mState[sKey];
		if (!oTooltip || !oItem || !oState || !oState.tooltip) {
			this._hideTooltip();
			return;
		}
		this._sTooltipKey = sKey;
		this._renderTooltip(oTooltip, oState.tooltip);
		var oRoot = this.getDomRef().getBoundingClientRect();
		var oRect = oItem.el.getBoundingClientRect();
		oTooltip.style.visibility = "hidden";
		oTooltip.style.display = "block";
		var iWidth = oTooltip.offsetWidth;
		var iHeight = oTooltip.offsetHeight;
		var fLeft = oRect.right - oRoot.left + 8;
		if (fLeft + iWidth > oRoot.width - 4) {
			fLeft = oRect.left - oRoot.left - iWidth - 8;
		}
		var fTop = Math.max(4, Math.min(oRoot.height - iHeight - 4, oRect.top - oRoot.top + oRect.height / 2 - iHeight / 2));
		oTooltip.style.left = Math.max(4, fLeft) + "px";
		oTooltip.style.top = fTop + "px";
		oTooltip.style.visibility = "visible";
	};

	FloorMap.prototype._renderTooltip = function (oTooltip, oContent) {
		var sSignature = JSON.stringify(oContent);
		if (oTooltip._wcSignature === sSignature) {
			return;
		}
		oTooltip._wcSignature = sSignature;
		oTooltip.textContent = "";
		var oTitle = document.createElement("div");
		oTitle.className = "wcTooltipTitle";
		oTitle.textContent = oContent.title || "";
		oTooltip.appendChild(oTitle);
		(oContent.rows || []).forEach(function (oRow) {
			var oLine = document.createElement("div");
			oLine.className = "wcTooltipRow";
			var oLabel = document.createElement("span");
			oLabel.className = "wcTooltipLabel";
			oLabel.textContent = oRow.label;
			var oValue = document.createElement("span");
			oValue.className = "wcTooltipValue" + (oRow.state ? " wcTooltipValue--" + oRow.state : "");
			oValue.textContent = oRow.value;
			oLine.appendChild(oLabel);
			oLine.appendChild(oValue);
			oTooltip.appendChild(oLine);
		});
	};

	FloorMap.prototype._refreshTooltip = function () {
		if (!this._sTooltipKey) {
			return;
		}
		var oTooltip = this.getDomRef("tooltip");
		var oState = this._mState[this._sTooltipKey];
		if (oTooltip && oState && oState.tooltip) {
			this._renderTooltip(oTooltip, oState.tooltip);
		}
	};

	FloorMap.prototype._hideTooltip = function () {
		var oTooltip = this.getDomRef("tooltip");
		this._sTooltipKey = "";
		if (oTooltip) {
			oTooltip.style.display = "none";
		}
	};

	/* ------------------------------------------------------------------ */
	/* Keyboard                                                             */
	/* ------------------------------------------------------------------ */

	FloorMap.prototype._isNavigable = function (oItem) {
		if (oItem.type === "bin") {
			return this.getShowBins() && !this.getSimplified();
		}
		if (oItem.type === "dock") {
			return this.getShowDocks();
		}
		return this.getShowWorkers();
	};

	FloorMap.prototype._navigableItems = function () {
		var that = this;
		return this._aItems.filter(function (oItem) {
			return that._isNavigable(oItem);
		});
	};

	FloorMap.prototype._ensureTabStop = function () {
		var aItems = this._navigableItems();
		if (!aItems.length) {
			return;
		}
		var oCurrent = this._mItems[this._sFocusKey];
		if (!oCurrent || !this._isNavigable(oCurrent)) {
			this._setFocusKey(aItems[0].key);
		}
	};

	FloorMap.prototype._setFocusKey = function (sKey) {
		var oPrevious = this._mItems[this._sFocusKey];
		if (oPrevious && oPrevious.key !== sKey) {
			oPrevious.el.setAttribute("tabindex", "-1");
		}
		this._sFocusKey = sKey;
		var oItem = this._mItems[sKey];
		if (oItem) {
			oItem.el.setAttribute("tabindex", "0");
		}
	};

	FloorMap.prototype._onFocusIn = function (oEvent) {
		var oTarget = oEvent.target.closest && oEvent.target.closest(".wcItem");
		if (!oTarget) {
			return;
		}
		var sKey = oTarget.getAttribute("data-key");
		this._bHasFocus = true;
		this._setFocusKey(sKey);
		this._placeRing(this._oFocusRing, this._mItems[sKey]);
		this._scrollIntoView(this._mItems[sKey]);
		this._showTooltip(sKey);
	};

	FloorMap.prototype._onFocusOut = function () {
		this._bHasFocus = false;
		this._oFocusRing.setAttribute("visibility", "hidden");
		this._hideTooltip();
	};

	FloorMap.prototype._scrollIntoView = function (oItem) {
		if (this.getZoom() <= 1.001) {
			return;
		}
		var oBox = this._viewBox();
		var fPad = 4;
		if (oItem.cx < oBox.x + fPad || oItem.cx > oBox.x + oBox.width - fPad ||
			oItem.cy < oBox.y + fPad || oItem.cy > oBox.y + oBox.height - fPad) {
			this._oCentre = { x: oItem.cx, y: oItem.cy };
			this._applyViewBox();
		}
	};

	FloorMap.prototype._nearest = function (oFrom, sDirection) {
		var mVector = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1]
		}[sDirection];
		var oBest = null;
		var fBestScore = Infinity;
		this._navigableItems().forEach(function (oItem) {
			if (oItem === oFrom) {
				return;
			}
			var fDx = oItem.cx - oFrom.cx;
			var fDy = oItem.cy - oFrom.cy;
			var fAlong = fDx * mVector[0] + fDy * mVector[1];
			if (fAlong <= 0.1) {
				return;
			}
			var fAcross = Math.abs(fDx * mVector[1] - fDy * mVector[0]);
			var fScore = fAlong + fAcross * 2.5;
			if (fScore < fBestScore) {
				fBestScore = fScore;
				oBest = oItem;
			}
		});
		return oBest;
	};

	FloorMap.prototype._onKeyDown = function (oEvent) {
		var oCurrent = this._mItems[this._sFocusKey];
		var aItems = this._navigableItems();
		var oNext = null;
		switch (oEvent.key) {
			case "ArrowLeft":
			case "ArrowRight":
			case "ArrowUp":
			case "ArrowDown":
				oNext = oCurrent ? this._nearest(oCurrent, oEvent.key) : aItems[0];
				break;
			case "Home":
				oNext = aItems[0];
				break;
			case "End":
				oNext = aItems[aItems.length - 1];
				break;
			case "Enter":
			case " ":
				if (oCurrent) {
					oEvent.preventDefault();
					this._select(oCurrent.key);
				}
				return;
			case "+":
			case "=":
				oEvent.preventDefault();
				this.zoomIn();
				return;
			case "-":
				oEvent.preventDefault();
				this.zoomOut();
				return;
			case "0":
				oEvent.preventDefault();
				this.fitToScreen();
				return;
			case "Escape":
				if (this.getSelectedKey()) {
					oEvent.preventDefault();
					this.fireSelect({ key: "", type: "" });
				}
				return;
			default:
				return;
		}
		oEvent.preventDefault();
		if (oNext) {
			this.focusItem(oNext.key);
		}
	};

	return FloorMap;
});
