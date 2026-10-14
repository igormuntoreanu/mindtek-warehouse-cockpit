sap.ui.define([], function () {
	"use strict";

	/*
	 * Floor plan of HM01 in metres. x runs left to right, y top to bottom.
	 * Receiving with the inbound doors is on the left wall, Packing and Shipping
	 * with the outbound doors on the right wall. Two cross aisles (top and bottom)
	 * connect all zones; storage aisles run vertically between them.
	 */
	var WIDTH = 152;
	var HEIGHT = 80;
	var CROSS_AISLES = [8, 74];
	var DOOR_Y = [18, 34, 50, 66];
	var BIN_TOP = 14;
	var BIN_STEP = 5.6;
	var BIN_HEIGHT = 5.2;
	var BINS_PER_SIDE = 10;

	var ZONES = [
		{ id: "RECV", key: "receiving", x: 0, y: 0, width: 24, height: HEIGHT },
		{ id: "STA", key: "storageA", x: 26, y: 0, width: 48, height: HEIGHT },
		{ id: "STB", key: "storageB", x: 76, y: 0, width: 48, height: HEIGHT },
		{ id: "PACK", key: "packing", x: 126, y: 0, width: 26, height: HEIGHT }
	];

	var STORAGE = [
		{ zoneId: "STA", letter: "A", firstX: 30 },
		{ zoneId: "STB", letter: "B", firstX: 80 }
	];

	function pad(iValue) {
		return iValue < 10 ? "0" + iValue : String(iValue);
	}

	function buildAisles() {
		var aAisles = [];
		STORAGE.forEach(function (oStorage) {
			for (var a = 0; a < 3; a++) {
				var x0 = oStorage.firstX + a * 15;
				aAisles.push({
					id: oStorage.letter + (a + 1),
					zoneId: oStorage.zoneId,
					x: x0 + 3,
					y: BIN_TOP - 1,
					width: 4,
					height: BINS_PER_SIDE * BIN_STEP + 1.6,
					centreX: x0 + 5,
					rackX: x0
				});
			}
		});
		return aAisles;
	}

	function buildBins(aAisles) {
		var aBins = [];
		aAisles.forEach(function (oAisle) {
			for (var p = 1; p <= BINS_PER_SIDE; p++) {
				["L", "R"].forEach(function (sSide) {
					var y = BIN_TOP + (p - 1) * BIN_STEP;
					aBins.push({
						id: oAisle.id + "-" + pad(p) + "-" + sSide,
						zoneId: oAisle.zoneId,
						aisleId: oAisle.id,
						side: sSide,
						position: p,
						x: sSide === "L" ? oAisle.rackX : oAisle.rackX + 7,
						y: y,
						width: 3,
						height: BIN_HEIGHT,
						accessX: oAisle.centreX,
						accessY: y + BIN_HEIGHT / 2
					});
				});
			}
		});
		return aBins;
	}

	function buildDocks() {
		var aDocks = [];
		DOOR_Y.forEach(function (y, i) {
			aDocks.push({
				id: "D0" + (i + 1),
				direction: "inbound",
				x: -0.6,
				y: y - 4,
				width: 1.2,
				height: 8,
				centreY: y,
				accessX: 3,
				accessY: y
			});
		});
		DOOR_Y.forEach(function (y, i) {
			aDocks.push({
				id: "D0" + (i + 5),
				direction: "outbound",
				x: WIDTH - 0.6,
				y: y - 4,
				width: 1.2,
				height: 8,
				centreY: y,
				accessX: WIDTH - 2,
				accessY: y
			});
		});
		return aDocks;
	}

	function buildStations() {
		return DOOR_Y.map(function (y, i) {
			return {
				id: "P" + (i + 1),
				x: 129,
				y: y - 4,
				width: 8,
				height: 8,
				accessX: 127.5,
				accessY: y
			};
		});
	}

	function buildStaging() {
		return DOOR_Y.map(function (y, i) {
			return {
				id: "S" + (i + 1),
				dockId: "D0" + (i + 5),
				x: 141,
				y: y - 3,
				width: 8,
				height: 6
			};
		});
	}

	/**
	 * Route between two points on the floor. Points on the same vertical line
	 * (one aisle) are joined directly; otherwise the route uses the cross aisle
	 * that gives the shorter detour.
	 *
	 * @param {{x: number, y: number}} oFrom Start point
	 * @param {{x: number, y: number}} oTo End point
	 * @returns {Array<{x: number, y: number}>} Waypoints including both ends
	 */
	function route(oFrom, oTo) {
		var oStart = { x: oFrom.x, y: oFrom.y };
		var oEnd = { x: oTo.x, y: oTo.y };
		if (Math.abs(oStart.x - oEnd.x) < 0.01) {
			return [oStart, oEnd];
		}
		var fCross = CROSS_AISLES.reduce(function (fBest, fLane) {
			var fCost = Math.abs(oStart.y - fLane) + Math.abs(oEnd.y - fLane);
			var fBestCost = Math.abs(oStart.y - fBest) + Math.abs(oEnd.y - fBest);
			return fCost < fBestCost ? fLane : fBest;
		}, CROSS_AISLES[0]);
		var aPoints = [oStart, { x: oStart.x, y: fCross }, { x: oEnd.x, y: fCross }, oEnd];
		return aPoints.filter(function (oPoint, i) {
			var oPrev = aPoints[i - 1];
			return !oPrev || Math.abs(oPrev.x - oPoint.x) > 0.01 || Math.abs(oPrev.y - oPoint.y) > 0.01;
		});
	}

	function pathLength(aPoints) {
		var fLength = 0;
		for (var i = 1; i < aPoints.length; i++) {
			fLength += Math.abs(aPoints[i].x - aPoints[i - 1].x) + Math.abs(aPoints[i].y - aPoints[i - 1].y);
		}
		return fLength;
	}

	/**
	 * Builds the static geometry of the warehouse.
	 *
	 * @returns {object} Plain object with zones, aisles, bins, docks, stations, staging and cross aisles
	 */
	function create() {
		var aAisles = buildAisles();
		return {
			width: WIDTH,
			height: HEIGHT,
			zones: ZONES.map(function (oZone) {
				return Object.assign({}, oZone);
			}),
			crossAisles: CROSS_AISLES.map(function (y) {
				return { x: 0, y: y - 3, width: WIDTH, height: 6 };
			}),
			aisles: aAisles,
			bins: buildBins(aAisles),
			docks: buildDocks(),
			stations: buildStations(),
			staging: buildStaging()
		};
	}

	return {
		WIDTH: WIDTH,
		HEIGHT: HEIGHT,
		CROSS_AISLES: CROSS_AISLES,
		create: create,
		route: route,
		pathLength: pathLength
	};
});
