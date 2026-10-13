sap.ui.define([], function () {
	"use strict";

	/**
	 * Seeded pseudo-random numbers (mulberry32), so a seed always gives the same warehouse.
	 *
	 * @param {int} iSeed Any 32-bit integer
	 * @returns {object} Generator with next, int, range, pick, weighted and shuffle
	 */
	function create(iSeed) {
		var iState = iSeed >>> 0;

		function next() {
			iState = (iState + 0x6D2B79F5) >>> 0;
			var t = iState;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		}

		return {
			next: next,
			int: function (iMin, iMax) {
				return iMin + Math.floor(next() * (iMax - iMin + 1));
			},
			range: function (fMin, fMax) {
				return fMin + next() * (fMax - fMin);
			},
			pick: function (aItems) {
				return aItems[Math.floor(next() * aItems.length)];
			},
			weighted: function (aItems, fnWeight) {
				var fTotal = aItems.reduce(function (fSum, oItem) {
					return fSum + fnWeight(oItem);
				}, 0);
				var fRoll = next() * fTotal;
				for (var i = 0; i < aItems.length; i++) {
					fRoll -= fnWeight(aItems[i]);
					if (fRoll <= 0) {
						return aItems[i];
					}
				}
				return aItems[aItems.length - 1];
			},
			shuffle: function (aItems) {
				var aCopy = aItems.slice();
				for (var i = aCopy.length - 1; i > 0; i--) {
					var j = Math.floor(next() * (i + 1));
					var oTemp = aCopy[i];
					aCopy[i] = aCopy[j];
					aCopy[j] = oTemp;
				}
				return aCopy;
			}
		};
	}

	return {
		create: create
	};
});
