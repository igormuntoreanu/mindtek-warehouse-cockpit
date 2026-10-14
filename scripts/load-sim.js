"use strict";

/*
 * Loads the simulation modules (webapp/sim) in Node. They use sap.ui.define
 * without UI5 dependencies, so a small resolver is enough.
 */
var path = require("path");

var simDir = path.join(__dirname, "..", "webapp", "sim");
var cache = {};

function load(name) {
	if (cache[name]) {
		return cache[name];
	}
	var definition;
	global.sap = {
		ui: {
			define: function (deps, factory) {
				definition = { deps: deps, factory: factory };
			}
		}
	};
	var file = path.join(simDir, name + ".js");
	delete require.cache[require.resolve(file)];
	require(file);
	var current = definition;
	var args = current.deps.map(function (dep) {
		return load(dep.replace(/^\.\//, ""));
	});
	cache[name] = current.factory.apply(null, args);
	return cache[name];
}

module.exports = load;
