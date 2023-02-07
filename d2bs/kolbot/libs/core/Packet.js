/**
*  @filename    Packet.js
*  @author      kolton, theBGuy
*  @desc        handle packet based functions
*
*/

const Packet = {
	/**
	 * Interact and open the menu of an NPC
	 * @param {NPCUnit} unit 
	 * @returns {boolean}
	 */
	openMenu: function (unit) {
		if (unit.type !== sdk.unittype.NPC) throw new Error("openMenu: Must be used on NPCs.");
		if (getUIFlag(sdk.uiflags.NPCMenu)) return true;
		let pingDelay = (me.gameReady ? me.ping : 125);

		for (let i = 0; i < 5; i += 1) {
			unit.distance > 4 && Pather.moveToUnit(unit);
			Packet.entityInteract(unit);
			let tick = getTickCount();

			while (getTickCount() - tick < 5000) {
				if (getUIFlag(sdk.uiflags.NPCMenu)) {
					delay(Math.max(500, pingDelay * 2));

					return true;
				}

				if ((getTickCount() - tick > 1000 && getInteractedNPC()) || (getTickCount() - tick > 500 && getIsTalkingNPC())) {
					me.cancel();
				}

				delay(100);
			}

			sendPacket(1, sdk.packets.send.NPCInit, 4, 1, 4, unit.gid);
			delay(pingDelay + 1 * 2);
			Packet.cancelNPC(unit);
			delay(pingDelay + 1 * 2);
			this.flash(me.gid);
		}

		return false;
	},

	/**
	 * Start a trade action with an NPC
	 * @param {NPCUnit} unit 
	 * @param {number} mode
	 * @returns {boolean}
	 */
	startTrade: function (unit, mode) {
		if (unit.type !== sdk.unittype.NPC) throw new Error("Unit.startTrade: Must be used on NPCs.");
		if (getUIFlag(sdk.uiflags.Shop)) return true;

		const gamble = mode === "Gamble";
		console.info(true, mode + " at " + unit.name);

		if (this.openMenu(unit)) {
			for (let i = 0; i < 10; i += 1) {
				delay(200);

				i % 2 === 0 && sendPacket(1, sdk.packets.send.EntityAction, 4, gamble ? 2 : 1, 4, unit.gid, 4, 0);

				if (unit.itemcount > 0) {
					delay(200);
					console.info(false, "Successfully started " + mode + " at " + unit.name);
					return true;
				}
			}
		}

		return false;
	},

	/**
	 * Buy an item from an interacted NPC
	 * @param {NPCUnit} unit 
	 * @param {boolean} shiftBuy
	 * @param {boolean} gamble
	 * @returns {boolean}
	 */
	buyItem: function (unit, shiftBuy, gamble) {
		let oldGold = me.gold;
		let itemCount = me.itemcount;
		let npc = getInteractedNPC();

		try {
			if (!npc) throw new Error("buyItem: No NPC menu open.");

			// Can we afford the item?
			if (oldGold < unit.getItemCost(sdk.items.cost.ToBuy)) return false;

			for (let i = 0; i < 3; i += 1) {
				sendPacket(1, sdk.packets.send.NPCBuy, 4, npc.gid, 4, unit.gid, 4, shiftBuy ? 0x80000000 : gamble ? 0x2 : 0x0, 4, 0);

				let tick = getTickCount();

				while (getTickCount() - tick < Math.max(2000, me.ping * 2 + 500)) {
					if (shiftBuy && me.gold < oldGold) return true;
					if (itemCount !== me.itemcount) return true;

					delay(10);
				}
			}
		} catch (e) {
			console.error(e);
		}

		return false;
	},

	/**
	 * Buy scrolls from an interacted NPC, we need this as a seperate check because itemcount doesn't change
	 * if the scroll goes into the tome automatically.
	 * @param {NPCUnit} unit 
	 * @param {ItemUnit} [tome]
	 * @param {boolean} [shiftBuy]
	 * @returns {boolean}
	 */
	buyScroll: function (unit, tome, shiftBuy) {
		let oldGold = me.gold;
		let itemCount = me.itemcount;
		let npc = getInteractedNPC();
		tome === undefined && (tome = me.findItem(
			(unit.classid === sdk.items.ScrollofTownPortal ? sdk.items.TomeofTownPortal : sdk.items.TomeofIdentify),
			sdk.items.mode.inStorage, sdk.storage.Inventory
		));
		let preCount = !!tome ? tome.getStat(sdk.stats.Quantity) : 0;

		try {
			if (!npc) throw new Error("buyItem: No NPC menu open.");

			// Can we afford the item?
			if (oldGold < unit.getItemCost(sdk.items.cost.ToBuy)) return false;

			for (let i = 0; i < 3; i += 1) {
				sendPacket(1, sdk.packets.send.NPCBuy, 4, npc.gid, 4, unit.gid, 4, shiftBuy ? 0x80000000 : 0x0, 4, 0);

				let tick = getTickCount();

				while (getTickCount() - tick < Math.max(2000, me.ping * 2 + 500)) {
					if (shiftBuy && me.gold < oldGold) return true;
					if (itemCount !== me.itemcount) return true;
					if (tome && tome.getStat(sdk.stats.Quantity) > preCount) return true;
					delay(10);
				}
			}
		} catch (e) {
			console.error(e);
		}

		return false;
	},

	/**
	 * Sell a item to a NPC
	 * @param {ItemUnit} unit 
	 * @returns {boolean}
	 */
	sellItem: function (unit) {
		// Check if it's an item we want to buy
		if (unit.type !== sdk.unittype.Item) throw new Error("Unit.sell: Must be used on items.");
		if (!unit.sellable) {
			console.error((new Error("Item is unsellable")));
			return false;
		}

		let itemCount = me.itemcount;
		let npc = getInteractedNPC();

		if (!npc) return false;

		for (let i = 0; i < 5; i += 1) {
			sendPacket(1, sdk.packets.send.NPCSell, 4, npc.gid, 4, unit.gid, 4, 0, 4, 0);

			let tick = getTickCount();

			while (getTickCount() - tick < 2000) {
				if (me.itemcount !== itemCount) return true;
				delay(10);
			}
		}

		return false;
	},

	/**
	 * @param {ItemUnit} unit 
	 * @param {ItemUnit} tome
	 * @returns {boolean}
	 */
	identifyItem: function (unit, tome) {
		if (!unit || unit.identified) return false;

		CursorLoop:
		for (let i = 0; i < 3; i += 1) {
			sendPacket(1, sdk.packets.send.IndentifyItem, 4, unit.gid, 4, tome.gid);

			let tick = getTickCount();

			while (getTickCount() - tick < 2000) {
				if (getCursorType() === sdk.cursortype.Identify) {
					break CursorLoop;
				}

				delay(10);
			}
		}

		if (getCursorType() !== sdk.cursortype.Identify) {
			return false;
		}

		for (let i = 0; i < 3; i += 1) {
			getCursorType() === sdk.cursortype.Identify && sendPacket(1, sdk.packets.send.IndentifyItem, 4, unit.gid, 4, tome.gid);

			let tick = getTickCount();

			while (getTickCount() - tick < 2000) {
				if (unit.identified) {
					delay(50);
					return true;
				}

				delay(10);
			}
		}

		return false;
	},

	itemToCursor: function (item) {
		// Something already on cursor
		if (me.itemoncursor) {
			let cursorItem = Game.getCursorUnit();
			// Return true if the item is already on cursor
			if (cursorItem.gid === item.gid) {
				return true;
			}
			this.dropItem(cursorItem); // If another item is on cursor, drop it
		}

		for (let i = 0; i < 15; i += 1) {
			// equipped
			item.isEquipped ? sendPacket(1, sdk.packets.send.PickupBodyItem, 2, item.bodylocation) : sendPacket(1, sdk.packets.send.PickupBufferItem, 4, item.gid);

			let tick = getTickCount();

			while (getTickCount() - tick < Math.max(500, me.ping * 2 + 200)) {
				if (me.itemoncursor) return true;
				delay(10);
			}
		}

		return false;
	},

	dropItem: function (item) {
		if (!this.itemToCursor(item)) return false;

		for (let i = 0; i < 15; i += 1) {
			sendPacket(1, sdk.packets.send.DropItem, 4, item.gid);

			let tick = getTickCount();

			while (getTickCount() - tick < Math.max(500, me.ping * 2 + 200)) {
				if (!me.itemoncursor) return true;
				delay(10);
			}
		}

		return false;
	},

	givePotToMerc: function (item) {
		if (!!item
			&& [sdk.items.type.HealingPotion, sdk.items.type.RejuvPotion, sdk.items.type.ThawingPotion, sdk.items.type.AntidotePotion].includes(item.itemType)) {
			switch (item.location) {
			case sdk.storage.Belt:
				return this.useBeltItemForMerc(item);
			case sdk.storage.Inventory:
				if (this.itemToCursor(item)) {
					sendPacket(1, sdk.packets.send.MercItem, 2, 0);

					return true;
				}

				break;
			default:
				break;
			}
		}

		return false;
	},

	placeInBelt: function (item, xLoc) {
		item.toCursor(true) && new PacketBuilder().byte(sdk.packets.send.ItemToBelt).dword(item.gid).dword(xLoc).send();
		return Misc.poll(() => item.isInBelt, 500, 100);
	},

	click: function (who, toCursor = false) {
		if (!who || !copyUnit(who).x) return false;
		new PacketBuilder().byte(sdk.packets.send.PickupItem).dword(sdk.unittype.Item).dword(who.gid).dword(toCursor ? 1 : 0).send();
		return true;
	},

	entityInteract: function (who) {
		if (!who || !copyUnit(who).x) return false;
		sendPacket(1, sdk.packets.send.InteractWithEntity, 4, who.type, 4, who.gid);
		return true;
	},

	cancelNPC: function (who) {
		if (!who || !copyUnit(who).x) return false;
		sendPacket(1, sdk.packets.send.NPCCancel, 4, who.type, 4, who.gid);
		return true;
	},

	/**
	 * @param {ItemUnit} pot 
	 * @returns {boolean}
	 */
	useBeltItemForMerc: function (pot) {
		if (!pot) return false;
		sendPacket(1, sdk.packets.send.UseBeltItem, 4, pot.gid, 4, 1, 4, 0);
		return true;
	},

	castSkill: function (hand, wX, wY) {
		hand = (hand === sdk.skills.hand.Right) ? sdk.packets.send.RightSkillOnLocation : sdk.packets.send.LeftSkillOnLocation;
		sendPacket(1, hand, 2, wX, 2, wY);
	},

	/**
	 * @param {number} hand
	 * @param {Monster | ItemUnit | ObjectUnit} who 
	 * @returns {boolean}
	 */
	unitCast: function (hand, who) {
		hand = (hand === sdk.skills.hand.Right) ? sdk.packets.send.RightSkillOnEntityEx3 : sdk.packets.send.LeftSkillOnEntityEx3;
		sendPacket(1, hand, 4, who.type, 4, who.gid);
	},

	/**
	 * @param {Monster | ItemUnit | ObjectUnit} who 
	 * @returns {boolean}
	 */
	telekinesis: function (who) {
		if (!who || !Skill.setSkill(sdk.skills.Telekinesis, sdk.skills.hand.Right)) return false;
		sendPacket(1, sdk.packets.send.RightSkillOnEntityEx3, 4, who.type, 4, who.gid);
		return true;
	},

	/**
	 * @param {Player | Monster | MercUnit} who 
	 * @returns {boolean}
	 */
	enchant: function (who) {
		if (!who || !Skill.setSkill(sdk.skills.Enchant, sdk.skills.hand.Right)) return false;
		sendPacket(1, sdk.packets.send.RightSkillOnEntityEx3, 4, who.type, 4, who.gid);
		return true;
	},

	/**
	 * @param {number} wX 
	 * @param {number} wY 
	 * @returns {boolean}
	 */
	teleport: function (wX, wY) {
		if (![wX, wY].every(n => typeof n === "number") || !Skill.setSkill(sdk.skills.Teleport, sdk.skills.hand.Right)) return false;
		new PacketBuilder().byte(sdk.packets.send.RightSkillOnLocation).word(wX).word(wY).send();
		return true;
	},

	// moveNPC: function (npc, dwX, dwY) { // commented the patched packet
	// 	//sendPacket(1, sdk.packets.send.MakeEntityMove, 4, npc.type, 4, npc.gid, 4, dwX, 4, dwY);
	// },

	/**
	 * @deprecated
	 * @param {number} x 
	 * @param {number} y 
	 * @param {number} maxDist 
	 * @returns {boolean}
	 */
	teleWalk: function (x, y, maxDist = 5) {
		!Packet.telewalkTick && (Packet.telewalkTick = 0);

		if (getDistance(me, x, y) > 10 && getTickCount() - this.telewalkTick > 3000 && Attack.validSpot(x, y)) {
			for (let i = 0; i < 5; i += 1) {
				sendPacket(1, sdk.packets.send.UpdatePlayerPos, 2, x + rand(-1, 1), 2, y + rand(-1, 1));
				delay(me.ping + 1);
				sendPacket(1, sdk.packets.send.RequestEntityUpdate, 4, me.type, 4, me.gid);
				delay(me.ping + 1);

				if (getDistance(me, x, y) < maxDist) {
					delay(200);

					return true;
				}
			}

			Packet.telewalkTick = getTickCount();
		}

		return false;
	},

	questRefresh: function () {
		sendPacket(1, sdk.packets.send.UpdateQuests);
	},

	/**
	 * Request entity update
	 * @param {number} gid 
	 * @param {number} wait 
	 */
	flash: function (gid, wait = 0) {
		wait === 0 && (wait = 300 + (me.gameReady ? 2 * me.ping : 300));
		sendPacket(1, sdk.packets.send.RequestEntityUpdate, 4, 0, 4, gid);

		if (wait > 0) {
			delay(wait);
		}
	},

	/**
	 * @deprecated
	 * @param {number} stat 
	 * @param {number} value 
	 */
	changeStat: function (stat, value) {
		if (value > 0) {
			getPacket(1, 0x1d, 1, stat, 1, value);
		}
	},

	// specialized wrapper for addEventListener
	addListener: function (packetType, callback) {
		if (typeof packetType === "number") {
			packetType = [packetType];
		}

		if (typeof packetType === "object" && packetType.length) {
			addEventListener("gamepacket", packet => (packetType.indexOf(packet[0]) > -1 ? callback(packet) : false));

			return callback;
		}

		return null;
	},

	removeListener: callback => removeEventListener("gamepacket", callback), // just a wrapper
};
