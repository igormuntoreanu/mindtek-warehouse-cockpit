sap.ui.define([
	"./random",
	"./layout"
], function (random, layout) {
	"use strict";

	var MINUTE = 60 * 1000;
	var HOUR = 60 * MINUTE;
	var DAY = 24 * HOUR;

	var CATEGORIES = [
		{
			key: "servo",
			zone: "STB",
			maxQty: 3,
			names: [
				"Servo motor HMS-40 0.2 kW", "Servo motor HMS-40 0.2 kW, brake",
				"Servo motor HMS-60 0.4 kW", "Servo motor HMS-60 0.4 kW, brake",
				"Servo motor HMS-80 0.75 kW", "Servo motor HMS-80 0.75 kW, brake",
				"Servo motor HMS-100 1.5 kW", "Servo motor HMS-100 1.5 kW, brake",
				"Servo motor HMS-130 3.0 kW", "Servo motor HMS-130 3.0 kW, brake",
				"Servo motor HMS-180 5.5 kW", "Servo motor HMS-180 5.5 kW, brake"
			]
		},
		{
			key: "gearbox",
			zone: "STB",
			maxQty: 3,
			names: [
				"Planetary gearbox PG60 i=5", "Planetary gearbox PG60 i=10",
				"Planetary gearbox PG90 i=5", "Planetary gearbox PG90 i=10",
				"Planetary gearbox PG120 i=5", "Planetary gearbox PG120 i=10",
				"Planetary gearbox PG155 i=16", "Right-angle gearbox RG70 i=7",
				"Right-angle gearbox RG90 i=10", "Right-angle gearbox RG120 i=14",
				"Harmonic gearbox HG32 i=50", "Harmonic gearbox HG40 i=100"
			]
		},
		{
			key: "guide",
			zone: "STB",
			maxQty: 4,
			names: [
				"Linear guide rail LGR15, 600 mm", "Linear guide rail LGR15, 1000 mm",
				"Linear guide rail LGR20, 600 mm", "Linear guide rail LGR20, 1000 mm",
				"Linear guide rail LGR20, 1500 mm", "Linear guide rail LGR25, 1000 mm",
				"Linear guide rail LGR25, 2000 mm", "Guide carriage LGC15",
				"Guide carriage LGC20", "Guide carriage LGC25",
				"Ball screw BS16, 800 mm", "Ball screw BS20, 1200 mm"
			]
		},
		{
			key: "controller",
			zone: "STA",
			maxQty: 4,
			names: [
				"Servo drive HSD-2, 2 A", "Servo drive HSD-4, 4 A",
				"Servo drive HSD-8, 8 A", "Servo drive HSD-16, 16 A",
				"Servo drive HSD-32, 32 A", "Motion controller HMC-200",
				"Motion controller HMC-400", "Safety module HSM-10",
				"I/O module HIO-16", "Fieldbus coupler HFC-1",
				"Power supply HPS-24, 10 A", "Brake resistor HBR-200"
			]
		},
		{
			key: "cable",
			zone: "STA",
			maxQty: 10,
			names: [
				"Motor cable, shielded, 3 m", "Motor cable, shielded, 5 m",
				"Motor cable, shielded, 10 m", "Encoder cable, 3 m",
				"Encoder cable, 5 m", "Encoder cable, 10 m",
				"Hybrid cable, 5 m", "Hybrid cable, 10 m",
				"Signal cable, 2 m", "Fieldbus cable, 1 m",
				"Fieldbus cable, 3 m", "Cable gland set M20"
			]
		}
	];

	var CUSTOMERS = [
		"Alpenbogen Mechanik GmbH", "Lindwurm Automation AG", "Seefeldt Robotik AG",
		"Kleinberg Fördertechnik GmbH", "Rheinbrück Antriebe AG", "Nordgrat Maschinenbau GmbH",
		"Glarnerstein Präzision AG", "Monteverde Movimento SA", "Aarewinkel Systems AG",
		"Juraquell Mechatronik SA", "Limmatbogen Lifttechnik AG", "Säntisblick Verpackung AG"
	];

	var CARRIERS = [
		{ id: "C1", name: "Alpentrans Logistik AG", dockId: "D05" },
		{ id: "C2", name: "Seeland Cargo AG", dockId: "D06" },
		{ id: "C3", name: "Rhône-Express Fret SA", dockId: "D07" },
		{ id: "C4", name: "Ostwind Transport GmbH", dockId: "D08" }
	];

	var PICKERS = [
		["P01", "Lea Brunner"], ["P02", "Jonas Meier"], ["P03", "Sofia Keller"], ["P04", "Luca Frei"],
		["P05", "Mia Baumann"], ["P06", "Noah Huber"], ["P07", "Elena Rossi"], ["P08", "Marco Steiner"]
	];

	var FORKLIFTS = [
		["F01", "Daniel Graf"], ["F02", "Nina Vogel"]
	];

	var CANTONS = ["ZH", "AG", "SG", "LU", "BE", "TG", "SZ", "ZG"];

	function initials(sName) {
		return sName.split(" ").map(function (sPart) {
			return sPart.charAt(0);
		}).join("");
	}

	function plate(oRandom) {
		return oRandom.pick(CANTONS) + " " + oRandom.int(100, 999) + " " + oRandom.int(100, 999);
	}

	function buildProducts(oRandom) {
		var aProducts = [];
		CATEGORIES.forEach(function (oCategory) {
			oCategory.names.forEach(function (sName) {
				aProducts.push({
					id: "HM-" + (10001 + aProducts.length),
					name: sName,
					category: oCategory.key,
					zoneId: oCategory.zone,
					maxQty: oCategory.maxQty,
					unit: "PC"
				});
			});
		});
		var aRanks = oRandom.shuffle(aProducts.map(function (oProduct, i) {
			return i + 1;
		}));
		aProducts.forEach(function (oProduct, i) {
			oProduct.popularity = 1 / Math.pow(aRanks[i], 0.7);
		});
		return aProducts;
	}

	function fillLevel(oRandom) {
		var fRoll = oRandom.next();
		if (fRoll < 0.07) {
			return 0;
		}
		if (fRoll < 0.22) {
			return oRandom.range(0.06, 0.24);
		}
		if (fRoll < 0.84) {
			return oRandom.range(0.3, 0.88);
		}
		return oRandom.range(0.91, 1);
	}

	function buildBins(oRandom, oLayout, aProducts, iNow) {
		var aBins = oLayout.bins.map(function (oGeometry) {
			return Object.assign({}, oGeometry);
		});
		["STA", "STB"].forEach(function (sZone) {
			var aZoneProducts = aProducts.filter(function (oProduct) {
				return oProduct.zoneId === sZone;
			});
			var aZoneBins = oRandom.shuffle(aBins.filter(function (oBin) {
				return oBin.zoneId === sZone;
			}));
			aZoneBins.forEach(function (oBin, i) {
				oBin.productId = aZoneProducts[i % aZoneProducts.length].id;
			});
		});
		aBins.forEach(function (oBin) {
			var bSmall = oBin.zoneId === "STA";
			var oProduct = aProducts.find(function (oCandidate) {
				return oCandidate.id === oBin.productId;
			});
			oBin.capacity = bSmall ? oRandom.pick([40, 50, 60, 80]) : oRandom.pick([12, 16, 20, 24, 30]);
			oBin.qty = Math.round(oBin.capacity * fillLevel(oRandom));
			oBin.reserved = 0;
			oBin.exception = null;
			oBin.pickCount = Math.round(6 + 150 * oProduct.popularity * oRandom.range(0.5, 1.3));
			var aHistory = [oBin.qty];
			for (var d = 1; d < 14; d++) {
				var iPrev = aHistory[0] + Math.round(oBin.capacity * oRandom.range(-0.18, 0.14));
				aHistory.unshift(Math.max(0, Math.min(oBin.capacity, iPrev)));
			}
			oBin.history = aHistory.map(function (iQty, i) {
				return { time: iNow - (13 - i) * DAY, qty: iQty };
			});
			var bPick = oRandom.next() < 0.7;
			var iMoved = bPick ? oRandom.int(1, oProduct.maxQty) : Math.max(1, Math.round(oBin.capacity * 0.4));
			oBin.movements = [{
				time: iNow - oRandom.int(8, 360) * MINUTE,
				type: bPick ? "pick" : "putaway",
				qty: bPick ? -iMoved : iMoved
			}];
		});
		return aBins;
	}

	function buildDeliveries(oRandom, aProducts, iNow) {
		var aOffsets = [];
		var i;
		for (i = 0; i < 5; i++) {
			aOffsets.push(-150 + i * 8);
		}
		for (i = 0; i < 4; i++) {
			aOffsets.push(-62 + i * 7);
		}
		for (i = 0; i < 5; i++) {
			aOffsets.push(12 + i * 7);
		}
		for (i = 0; i < 3; i++) {
			aOffsets.push(50 + i * 10);
		}
		aOffsets.push(-18, -6);
		for (i = 0; i < 21; i++) {
			aOffsets.push(20 + i * 16 + oRandom.int(0, 9));
		}
		return aOffsets.map(function (iOffset, iIndex) {
			var iCustomer = oRandom.int(0, CUSTOMERS.length - 1);
			var iLines = oRandom.int(1, 4);
			var aLines = [];
			while (aLines.length < iLines) {
				var oProduct = oRandom.weighted(aProducts, function (oCandidate) {
					return oCandidate.popularity;
				});
				var bDuplicate = aLines.some(function (oLine) {
					return oLine.productId === oProduct.id;
				});
				if (!bDuplicate) {
					aLines.push({
						productId: oProduct.id,
						qty: oRandom.int(1, oProduct.maxQty),
						plannedQty: 0,
						pickedQty: 0,
						shortQty: 0
					});
				}
			}
			var fPriority = oRandom.next();
			var sPriority = fPriority < 0.25 ? "High" : (fPriority < 0.75 ? "Medium" : "Low");
			if (iOffset < 0 && iIndex >= 17) {
				sPriority = "High";
			}
			return {
				id: String(80000101 + iIndex),
				customer: CUSTOMERS[iCustomer],
				carrierId: CARRIERS[iCustomer % CARRIERS.length].id,
				dueTime: iNow + iOffset * MINUTE,
				priority: sPriority,
				lines: aLines,
				status: "Open",
				waveId: null,
				stationId: null,
				truckId: null,
				packedAt: null,
				loadedAt: null
			};
		});
	}

	function buildWorkers() {
		var aWorkers = PICKERS.map(function (aPicker, i) {
			return {
				id: aPicker[0],
				name: aPicker[1],
				initials: initials(aPicker[1]),
				type: "picker",
				homeX: 128 + i * 3,
				homeY: 77.8
			};
		}).concat(FORKLIFTS.map(function (aForklift, i) {
			return {
				id: aForklift[0],
				name: aForklift[1],
				initials: aForklift[0],
				type: "forklift",
				homeX: 8 + i * 6,
				homeY: 77.8
			};
		}));
		return aWorkers.map(function (oWorker) {
			return Object.assign(oWorker, {
				x: oWorker.homeX,
				y: oWorker.homeY,
				status: "idle",
				phase: "idle",
				timer: 0,
				path: [],
				pathIndex: 0,
				pathVersion: 0,
				queue: [],
				currentTaskId: null,
				carrying: [],
				job: null,
				picksToday: 0,
				putawaysToday: 0
			});
		});
	}

	function lowestBinProducts(aBins, iCount) {
		var aSorted = aBins.slice().sort(function (a, b) {
			return a.qty / a.capacity - b.qty / b.capacity;
		});
		var aIds = [];
		aSorted.forEach(function (oBin) {
			if (aIds.length < iCount && aIds.indexOf(oBin.productId) < 0) {
				aIds.push(oBin.productId);
			}
		});
		return aIds;
	}

	/**
	 * Creates an inbound or outbound truck. Shared by the seed and the running engine.
	 */
	function createTruck(oRandom, oState, oDock, iNow) {
		oState.seq.truck += 1;
		var oTruck = {
			id: "T" + (100 + oState.seq.truck),
			plate: plate(oRandom),
			dockId: oDock.id,
			direction: oDock.direction,
			arrivedAt: iNow,
			deliveryIds: [],
			pallets: [],
			capacity: 60,
			load: 0
		};
		if (oDock.direction === "outbound") {
			oTruck.carrierId = oDock.carrierId;
			oTruck.etd = iNow + oRandom.int(45, 80) * MINUTE;
		} else {
			oTruck.carrierId = oRandom.pick(CARRIERS).id;
			var aProductIds = lowestBinProducts(oState.bins.filter(function (oBin) {
				return !oBin.exception;
			}), 12);
			var iPallets = oRandom.int(3, 5);
			for (var i = 0; i < iPallets; i++) {
				var sProductId = aProductIds[oRandom.int(0, aProductIds.length - 1)];
				var oBin = oState.bins.find(function (oCandidate) {
					return oCandidate.productId === sProductId;
				});
				oTruck.pallets.push({
					productId: sProductId,
					qty: Math.max(4, Math.round(oBin.capacity * oRandom.range(0.35, 0.6))),
					claimed: false,
					done: false
				});
			}
			oTruck.capacity = oTruck.pallets.length;
			oTruck.load = oTruck.pallets.length;
			oTruck.etd = null;
		}
		oState.trucks.push(oTruck);
		oDock.truckId = oTruck.id;
		oDock.nextArrival = null;
		return oTruck;
	}

	function completedWave(oState, sId, aDeliveries, oTimes, sStrategy, oRandom) {
		var aTaskIds = [];
		aDeliveries.forEach(function (oDelivery) {
			oDelivery.waveId = sId;
			oDelivery.lines.forEach(function (oLine, iLine) {
				var oBin = oState.bins.find(function (oCandidate) {
					return oCandidate.productId === oLine.productId;
				});
				oState.seq.task += 1;
				var oTask = {
					id: "T-" + oState.seq.task,
					waveId: sId,
					deliveryId: oDelivery.id,
					lineIndex: iLine,
					productId: oLine.productId,
					binId: oBin.id,
					qty: oLine.qty,
					pickedQty: oLine.qty,
					status: "Done",
					workerId: PICKERS[oRandom.int(0, PICKERS.length - 1)][0],
					startedAt: oTimes.started,
					completedAt: oTimes.completed - oRandom.int(1, 12) * MINUTE,
					resolution: null
				};
				oLine.plannedQty = oLine.qty;
				oLine.pickedQty = oLine.qty;
				oState.tasks.push(oTask);
				aTaskIds.push(oTask.id);
			});
		});
		oState.waves.push({
			id: sId,
			status: "Completed",
			strategy: sStrategy,
			deliveryIds: aDeliveries.map(function (oDelivery) {
				return oDelivery.id;
			}),
			taskIds: aTaskIds,
			stationId: "P1",
			workerIds: [],
			workersNeeded: 3,
			estimatedSeconds: Math.round((oTimes.completed - oTimes.started) / 1000),
			createdAt: oTimes.created,
			releasedAt: oTimes.released,
			startedAt: oTimes.started,
			completedAt: oTimes.completed,
			log: [
				{ time: oTimes.created, type: "Information", key: "logCreated", params: [aDeliveries.length, aTaskIds.length] },
				{ time: oTimes.released, type: "Information", key: "logReleased", params: [aTaskIds.length, 3] },
				{ time: oTimes.started, type: "Information", key: "logStarted", params: [] },
				{ time: oTimes.completed, type: "Success", key: "logCompleted", params: [] }
			]
		});
	}

	/**
	 * Builds the complete initial state of HM01 for a seed. The same seed and
	 * start time always give the same state.
	 *
	 * @param {int} iSeed Random seed
	 * @param {int} iNow Simulation start time (ms, UTC)
	 * @returns {object} Initial state (plain, JSON-compatible)
	 */
	function create(iSeed, iNow) {
		var oRandom = random.create(iSeed);
		var oLayout = layout.create();
		var aProducts = buildProducts(oRandom);
		var oState = {
			time: iNow,
			startTime: iNow,
			shiftStart: iNow - (3 * HOUR + 26 * MINUTE),
			layout: oLayout,
			products: aProducts,
			customers: CUSTOMERS.slice(),
			carriers: CARRIERS.map(function (oCarrier) {
				return Object.assign({}, oCarrier);
			}),
			bins: buildBins(oRandom, oLayout, aProducts, iNow),
			docks: oLayout.docks.map(function (oDock) {
				return Object.assign({}, oDock, { truckId: null, nextArrival: null, state: "free", loading: null });
			}),
			stations: oLayout.stations.map(function (oStation) {
				return Object.assign({}, oStation, { items: 0, queue: [] });
			}),
			trucks: [],
			workers: buildWorkers(),
			deliveries: buildDeliveries(oRandom, aProducts, iNow),
			waves: [],
			tasks: [],
			exceptions: [],
			pickLog: [],
			seq: { wave: 0, task: 0, exception: 0, truck: 0 }
		};

		CARRIERS.forEach(function (oCarrier) {
			oState.docks.find(function (oDock) {
				return oDock.id === oCarrier.dockId;
			}).carrierId = oCarrier.id;
		});

		completedWave(oState, "W-0001", oState.deliveries.slice(0, 5), {
			created: iNow - 105 * MINUTE,
			released: iNow - 100 * MINUTE,
			started: iNow - 99 * MINUTE,
			completed: iNow - 64 * MINUTE
		}, "DUE", oRandom);
		completedWave(oState, "W-0002", oState.deliveries.slice(5, 9), {
			created: iNow - 58 * MINUTE,
			released: iNow - 52 * MINUTE,
			started: iNow - 51 * MINUTE,
			completed: iNow - 21 * MINUTE
		}, "ZONE", oRandom);
		oState.seq.wave = 2;

		var oDocks = {};
		oState.docks.forEach(function (oDock) {
			oDocks[oDock.id] = oDock;
		});
		[["D01", 0, 0], ["D02", 0, 0], ["D05", 18, 54], ["D06", 6, 76], ["D08", 31, 38]].forEach(function (aSeed) {
			var oTruck = createTruck(oRandom, oState, oDocks[aSeed[0]], iNow - oRandom.int(10, 40) * MINUTE);
			if (oTruck.direction === "outbound") {
				oTruck.load = aSeed[1];
				oTruck.etd = iNow + aSeed[2] * MINUTE;
			}
		});
		oDocks.D03.nextArrival = iNow + 22 * MINUTE;
		oDocks.D04.nextArrival = iNow + 41 * MINUTE;
		oDocks.D07.nextArrival = iNow + 16 * MINUTE;

		oState.deliveries.slice(0, 5).forEach(function (oDelivery) {
			oDelivery.status = "Shipped";
			oDelivery.packedAt = iNow - 60 * MINUTE;
			oDelivery.loadedAt = iNow - 55 * MINUTE;
		});
		oState.deliveries.slice(5, 9).forEach(function (oDelivery) {
			var oDock = oDocks[CARRIERS.find(function (oCarrier) {
				return oCarrier.id === oDelivery.carrierId;
			}).dockId];
			oDelivery.packedAt = iNow - 18 * MINUTE;
			oDelivery.loadedAt = iNow - 12 * MINUTE;
			if (oDock.truckId) {
				var oTruck = oState.trucks.find(function (oCandidate) {
					return oCandidate.id === oDock.truckId;
				});
				oDelivery.status = "Loaded";
				oDelivery.truckId = oTruck.id;
				oTruck.deliveryIds.push(oDelivery.id);
			} else {
				oDelivery.status = "Shipped";
			}
		});

		for (var i = 0; i < 96; i++) {
			oState.pickLog.push(iNow - Math.round(oRandom.range(0, 60)) * MINUTE);
		}
		oState.pickLog.sort(function (a, b) {
			return a - b;
		});
		oState.workers.forEach(function (oWorker) {
			if (oWorker.type === "picker") {
				oWorker.picksToday = oRandom.int(118, 186);
			} else {
				oWorker.putawaysToday = oRandom.int(14, 26);
			}
		});
		return oState;
	}

	return {
		MINUTE: MINUTE,
		HOUR: HOUR,
		create: create,
		createTruck: createTruck
	};
});
