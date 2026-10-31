interface VacuumError {
	text: string;
	hint: string;
}

const stuckCodes = new Set([17, 18, 47, 63, 64]);

const lift = "Put it back on the floor, on a flat spot.";
const bin = "Empty the dust bin and put it back.";
const stuck = "Move it to an open spot and start it again.";
const cleanWater = "Fill the clean water tank.";
const dirtyWater = "Empty the dirty water tank and rinse it.";

const errors: Record<number, VacuumError> = {
	1: { text: "Wheels suspended", hint: lift },
	2: { text: "Cliff sensor blocked", hint: "Wipe the cliff sensors under it." },
	3: { text: "Bumper stuck", hint: "Tap the bumper free and clear the way." },
	4: { text: "Tilted", hint: lift },
	5: { text: "Bumper stuck", hint: "Tap the bumper free and clear the way." },
	6: { text: "Wheels suspended", hint: lift },
	7: { text: "Optical sensor error", hint: "Wipe the sensor under it." },
	8: { text: "Dust bin missing", hint: "Put the dust bin back in." },
	9: { text: "Water tank missing", hint: "Put the water tank back in." },
	10: { text: "Water tank empty", hint: cleanWater },
	11: { text: "Dust bin full", hint: bin },
	12: {
		text: "Main brush wrapped",
		hint: "Untangle the hair and threads from the main brush.",
	},
	13: { text: "Side brush wrapped", hint: "Untangle the side brush." },
	14: { text: "Fan error", hint: "Clean the filter, then restart it." },
	15: {
		text: "Left wheel stuck",
		hint: "Clear what's caught in the left wheel.",
	},
	16: {
		text: "Right wheel stuck",
		hint: "Clear what's caught in the right wheel.",
	},
	17: { text: "Robot is stuck", hint: stuck },
	18: { text: "Robot is stuck", hint: stuck },
	19: {
		text: "Can't find the dock",
		hint: "Put it on the dock, and keep the dock clear.",
	},
	20: { text: "Battery too low", hint: "Put it on the dock to charge." },
	21: {
		text: "Charging error",
		hint: "Wipe the charging contacts on the robot and the dock.",
	},
	24: { text: "Camera covered", hint: "Wipe the front camera." },
	26: { text: "Sensor covered", hint: "Wipe the sensors at the front." },
	27: { text: "Sensor covered", hint: "Wipe the sensors at the front." },
	29: {
		text: "Battery fault",
		hint: "Restart it; contact Dreame if it comes back.",
	},
	42: {
		text: "Water pump error",
		hint: "Check the water tank and restart it.",
	},
	47: { text: "Blocked by an obstacle", hint: stuck },
	48: {
		text: "Laser sensor error",
		hint: "Check nothing presses on the laser turret.",
	},
	49: {
		text: "Laser cover stuck",
		hint: "Press the laser turret cover until it moves freely.",
	},
	51: { text: "Filter blocked", hint: "Clean or replace the filter." },
	54: { text: "Edge sensor error", hint: "Wipe the side sensors." },
	56: {
		text: "Laser sensor blocked",
		hint: "Clear what blocks the laser turret.",
	},
	59: {
		text: "Stopped at a no-go zone",
		hint: "Move it out of the no-go zone.",
	},
	61: {
		text: "Can't reach the area",
		hint: "Clear the way to the room it should clean.",
	},
	62: {
		text: "Can't reach the area",
		hint: "Clear the way to the room it should clean.",
	},
	63: { text: "Blocked by an obstacle", hint: stuck },
	64: { text: "Blocked by an obstacle", hint: stuck },
	65: {
		text: "In a restricted area",
		hint: "Move it out of the restricted area.",
	},
	66: {
		text: "In a restricted area",
		hint: "Move it out of the restricted area.",
	},
	67: {
		text: "In a restricted area",
		hint: "Move it out of the restricted area.",
	},
	68: {
		text: "Mop pads attached",
		hint: "Remove the mop pads to vacuum carpets.",
	},
	69: { text: "Mop pads missing", hint: "Put the mop pads back on." },
	70: { text: "Mop pads missing", hint: "Put the mop pads back on." },
	71: {
		text: "Mop pads stopped turning",
		hint: "Clear what's caught in the mop pads.",
	},
	72: {
		text: "Mop pads stopped turning",
		hint: "Clear what's caught in the mop pads.",
	},
	101: { text: "Dust bin full", hint: bin },
	102: { text: "Dust bin open", hint: "Close the dust bin lid." },
	103: { text: "Dust bin open", hint: "Close the dust bin lid." },
	104: { text: "Dust bin full", hint: bin },
	105: { text: "Clean water low", hint: cleanWater },
	106: { text: "Dirty water tank full", hint: dirtyWater },
	107: { text: "Clean water low", hint: cleanWater },
	108: { text: "Dirty water tank full", hint: dirtyWater },
	109: { text: "Dirty water tank blocked", hint: dirtyWater },
	110: { text: "Dirty water pump error", hint: dirtyWater },
	111: { text: "Mop pads missing", hint: "Put the mop pads back on." },
	112: { text: "Mop pads too wet", hint: "Let the station dry the mop pads." },
	114: { text: "Mop pads need cleaning", hint: "Rinse the mop pads." },
	116: { text: "Clean water low", hint: cleanWater },
	117: {
		text: "Station disconnected",
		hint: "Check the station is plugged in.",
	},
	118: { text: "Dirty water tank full", hint: dirtyWater },
	119: {
		text: "Washboard needs cleaning",
		hint: "Take out the washboard and rinse it.",
	},
	120: {
		text: "Mop pads not in the station",
		hint: "Put the mop pads back on.",
	},
	121: { text: "Dust bag full", hint: "Replace the dust bag in the station." },
	122: { text: "Station self-test failed", hint: "Restart the station." },
	124: {
		text: "Washboard needs cleaning",
		hint: "Take out the washboard and rinse it.",
	},
	125: {
		text: "Couldn't get back to the dock",
		hint: "Put it on the dock, and keep the way clear.",
	},
};

/** What a Dreame error code means and what to do about it; an unknown code says its number. */
export function vacuumError(code: number): VacuumError {
	return (
		errors[code] ?? {
			text: `Error ${code}`,
			hint: "Check the robot, or its error in the Dreamehome app.",
		}
	);
}

/** Whether `code` says the robot is stuck or blocked, which it sometimes reports when it isn't. */
export function isStuck(code: number): boolean {
	return stuckCodes.has(code);
}
