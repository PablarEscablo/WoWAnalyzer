import { formatPercentage } from 'common/format';
import SPELLS from 'common/SPELLS';
import Analyzer, { Options, SELECTED_PLAYER } from 'parser/core/Analyzer';
import Events, {
  AbilityEvent,
  AnyEvent,
  CastEvent,
  ChangeHasteEvent,
  EventType,
  FightEndEvent,
  FilterCooldownInfoEvent,
  MaxChargesDecreasedEvent,
  MaxChargesIncreasedEvent,
  UpdateSpellUsableEvent,
  UpdateSpellUsableType,
} from 'parser/core/Events';
import Abilities from 'parser/core/modules/Abilities';
import EventEmitter from 'parser/core/modules/EventEmitter';

const DEBUG = true;

/** Margin in milliseconds beyond which we log errors if numbers don't line up */
export const COOLDOWN_LAG_MARGIN = 150;

function spellName(spellId: number) {
  return SPELLS[spellId] ? SPELLS[spellId].name : '???';
}

/**
 * Info about a spell that is currently cooling down.
 * When a spell finishes coolding down, the CooldownInfo about it is deleted.
 * Spells without charges are considered to effectively have one charge.
 */
type CooldownInfo = {
  /** Timestamp this cooldown started overall (not the most recent charge) */
  overallStart: number;
  /** The expected duration of the cooldown based on current conditions */
  expectedDuration: number;
  /** The expected end time of the cooldown based on current conditions */
  expectedEnd: number;
  /** The number of spell charges currently available
   * (for spells without charges this will always be zero) */
  chargesAvailable: number;
  /** The maximum number of charges this spell can have.
   * (for spells without charges this will always be one) */
  maxCharges: number;
};

/**
 * Comprehensive tracker for spell cooldown status
 */
class SpellUsable extends Analyzer {
  static dependencies = {
    eventEmitter: EventEmitter,
    abilities: Abilities,
  };
  protected eventEmitter!: EventEmitter;
  protected abilities!: Abilities;

  /** Trackers for currently active cooldowns.
   *  Spells that aren't on cooldown won't have an entry in this mapping */
  private _currentCooldowns: { [spellId: number]: CooldownInfo } = {};
  /** A global multiplier for the cooldown rate, also known as the 'modRate' */
  private _globalModRate: number = 1;
  /** Per-spell multipliers for the cooldown rate, also knowns as the 'modRate' */
  private _spellModRates: { [spellId: number]: number } = {};

  constructor(options: Options) {
    super(options);

    this.addEventListener(Events.any, this.onEvent);
    this.addEventListener(Events.cast.by(SELECTED_PLAYER), this.onCast);
    this.addEventListener(Events.prefiltercd.by(SELECTED_PLAYER), this.onCast);
    this.addEventListener(Events.ChangeHaste, this.onChangeHaste);
    this.addEventListener(Events.fightend, this.onFightEnd);
    this.addEventListener(Events.MaxChargesIncreased, this.onMaxChargesIncreased);
    this.addEventListener(Events.MaxChargesDescreased, this.onMaxChargesDecreased);
    // TODO handle prefilter
  }

  /////////////////////////////////////////////////////////////////////////////
  // PUBLIC QUERIES -
  // Methods other analyzers can use to query the state of a cooldown.
  // These are read-only and do not change state.
  //

  /**
   * Whether the spell can be cast. This is not the opposite of `isOnCooldown`!
   * A spell with 2 charges, 1 available and 1 on cooldown would be both
   * available and on cooldown at the same time.
   * @param spellId the spell's ID
   */
  public isAvailable(spellId: number): boolean {
    const cdInfo = this._currentCooldowns[this._getCanonicalId(spellId)];
    if (!cdInfo) {
      return true; // spell isn't on cooldown, therefore it is available
    }
    return cdInfo.chargesAvailable > 0;
  }

  /**
   * Whether the spell is cooling down. This is not the opposite of `isAvailable`!
   * A spell with 2 charges, 1 available and 1 on cooldown would be both
   * available and on cooldown at the same time.
   * @param spellId the spell's ID
   */
  public isOnCooldown(spellId: number): boolean {
    // a cooldown info exists iff the spell is on cooldown
    return Boolean(this._currentCooldowns[this._getCanonicalId(spellId)]);
  }

  /**
   * The number of charges of the spell currently available.
   * For an available spell without charges, this will always be one.
   * @param spellId the spell's ID
   */
  public chargesAvailable(spellId: number): number {
    const cdInfo = this._currentCooldowns[this._getCanonicalId(spellId)];
    if (!cdInfo) {
      return this.abilities.getMaxCharges(this._getCanonicalId(spellId)) || 1;
    }
    return cdInfo.chargesAvailable;
  }

  /**
   * The number of charges of the spell currently on cooldown
   * For an available spell without charges, this will always be zero.
   * @param spellId the spell's ID
   */
  public chargesOnCooldown(spellId: number): number {
    const cdInfo = this._currentCooldowns[this._getCanonicalId(spellId)];
    if (!cdInfo) {
      return 0;
    }
    return cdInfo.maxCharges - cdInfo.chargesAvailable;
  }

  /**
   * The time for the spell to recover a full charge in the current conditions.
   * This is NOT the time until the spell comes off cooldown!
   * Actual duration can change based on haste, modRate, or CDR.
   * For spells without a cooldown, this will always be zero.
   * @param spellId the spell's ID
   */
  public fullCooldownDuration(spellId: number): number {
    return this._getExpectedCooldown(this._getCanonicalId(spellId));
  }

  /**
   * The expected amount of time remaining on the spell's cooldown (for its current charge).
   * For spells that aren't on cooldown, this will always return zero.
   * @param spellId the spell's ID
   * @param timestamp the timestamp to check from (if different from current timestamp)
   * @return time remaining on the cooldown, in milliseconds
   */
  public cooldownRemaining(
    spellId: number,
    timestamp: number = this.owner.currentTimestamp,
  ): number {
    const cdInfo = this._currentCooldowns[this._getCanonicalId(spellId)];
    return !cdInfo ? 0 : cdInfo.expectedEnd - timestamp;
  }

  /////////////////////////////////////////////////////////////////////////////
  // PUBLIC COOLDOWN MANIPULATION -
  // Methods other analyzers can use to implement cooldown effects.
  // These methods do change state!
  //

  /**
   * Begins the spell's cooldown (as though the spell was just cast).
   * This is called automatically when the spell is cast, but analyzers can override or manually
   * call this in order to handle special cases.
   * @param {AbilityEvent<any>} triggeringEvent the event that triggered the cooldown
   *     (typically a CastEvent)
   * @param spellId the spell's ID, if it is different from the triggeringEvent's ID.
   */
  public beginCooldown(
    triggeringEvent: AbilityEvent<any>,
    spellId: number = triggeringEvent.ability.guid,
  ) {
    const cdSpellId = this._getCanonicalId(spellId);
    const cdInfo = this._currentCooldowns[cdSpellId];
    if (!cdInfo) {
      // spell isn't currently on cooldown - start a new cooldown!
      const ability = this.abilities.getAbility(cdSpellId);
      if (!ability) {
        return; // no registered ability for this - assume no cooldown
      }

      const expectedCooldownDuration = this._getExpectedCooldown(cdSpellId);
      if (!expectedCooldownDuration) {
        return; // this ability doesn't have a cooldown
      }
      const maxCharges = this.abilities.getMaxCharges(ability) || 1;

      const newInfo: CooldownInfo = {
        overallStart: triggeringEvent.timestamp,
        expectedEnd: triggeringEvent.timestamp + expectedCooldownDuration,
        expectedDuration: expectedCooldownDuration,
        chargesAvailable: maxCharges - 1,
        maxCharges,
      };
      this._currentCooldowns[cdSpellId] = newInfo;
      this._fabricateUpdateSpellUsableEvent(
        UpdateSpellUsableType.BeginCooldown,
        cdSpellId,
        triggeringEvent.timestamp,
        newInfo,
      );
    } else if (cdInfo.chargesAvailable > 0) {
      // spell is on CD but has an available charge
      cdInfo.chargesAvailable -= 1;
      this._fabricateUpdateSpellUsableEvent(
        UpdateSpellUsableType.UseCharge,
        cdSpellId,
        triggeringEvent.timestamp,
        cdInfo,
      );
    } else {
      // Spell shouldn't be available right now... if outside the lag margin, log an error.
      // In any event, the spell clearly *is* available, so we'll create a simultaneous
      // end cooldown and begin cooldown to represent what happened
      const remainingCooldown = cdInfo.expectedEnd - triggeringEvent.timestamp;
      if (remainingCooldown > COOLDOWN_LAG_MARGIN) {
        console.warn(
          'Cooldown error - ' +
            spellName(cdSpellId) +
            ' ID=' +
            cdSpellId +
            " was used while SpellUsable's tracker thought it had no available charges. " +
            'This could happen due to missing haste buffs, missing CDR, missing reductions/resets, ' +
            'or incorrect ability config.\n' +
            'Expected time left on CD: ' +
            remainingCooldown +
            '\n' +
            'Current Time: ' +
            triggeringEvent.timestamp +
            ' (' +
            this.owner.formatTimestamp(triggeringEvent.timestamp, 3) +
            ')' +
            '\n' +
            'CooldownInfo object before update: ' +
            JSON.stringify(cdInfo) +
            '\n',
        );
      }

      // trigger an end cooldown and then immediately a begin cooldown
      this.endCooldown(cdSpellId, triggeringEvent.timestamp);
      this.beginCooldown(triggeringEvent, spellId);
    }
  }

  /**
   * End the spell's cooldown (or for a spell with charges, restores one charge).
   * This is automatically called by this module when a spell's cooldown ends naturally.
   * This function should only be called externally to handle 'reset cooldown' or 'restore charge' effects.
   *
   * @param {number} spellId the spell's ID.
   * @param {number} timestamp the timestamp on which the cooldown ended,
   *     if different from currentTimestamp.
   * @param {boolean} resetCooldown if the cooldown's progress should be reset.
   *     This field is only relevant for spells with more than one charge.
   *     iff true, a charge will be added and cooldown progress will be set back to zero.
   *     iff false, a charge will be added and cooldown progress will be retained.
   *     Most 'restore charge' effects do not reset the cooldown, hence the default to false.
   * @param {boolean} restoreAllCharges if all charges should be restored rather than just one.
   *     This field is only relevant for spells with more than one charge.
   *     Most 'restore charge' effects restore only one charge, hence the default to false.
   */
  public endCooldown(
    spellId: number,
    timestamp: number = this.owner.currentTimestamp,
    resetCooldown: boolean = false,
    restoreAllCharges: boolean = false,
  ) {
    // get cooldown info
    const cdSpellId = this._getCanonicalId(spellId);
    const cdInfo = this._currentCooldowns[cdSpellId];
    if (!cdInfo) {
      // Nothing to end, the spell isn't on cooldown
      DEBUG &&
        console.info(
          'Tried to end cooldown of ' + spellName(spellId) + ", but it wasn't on cooldown",
        );
      return;
    }

    // restore charge(s)
    if (restoreAllCharges) {
      cdInfo.chargesAvailable = cdInfo.maxCharges;
    } else {
      cdInfo.chargesAvailable += 1;
    }

    // handles based on whether this was the last charge
    if (cdInfo.chargesAvailable === cdInfo.maxCharges) {
      // all charges restored - end the cooldown
      cdInfo.expectedEnd = timestamp; // expected in the event
      this._fabricateUpdateSpellUsableEvent(
        UpdateSpellUsableType.EndCooldown,
        cdSpellId,
        timestamp,
        cdInfo,
      );
      delete this._currentCooldowns[cdSpellId];
    } else {
      // intermediate charge restored - update info for new cooldown
      if (resetCooldown) {
        this._resetCooldown(cdSpellId, cdInfo, timestamp);
      }

      this._fabricateUpdateSpellUsableEvent(
        UpdateSpellUsableType.RestoreCharge,
        cdSpellId,
        timestamp,
        cdInfo,
      );
    }
  }

  /**
   * Reduces the time left on a cooldown by the given amount.
   * @param {number} spellId The ID of the spell.
   * @param {number} reductionMs The duration to reduce the cooldown by, in milliseconds.
   * @param {number} timestamp the timestamp on which the cooldown was reduced,
   *     if different from currentTimestamp.
   * @return {number} the effective cooldown reduction, in milliseconds.
   *     For example, if a spell's cooldown is reduced by 10 seconds, but the spell only has
   *     7 seconds left on the cooldown, '7 seconds' is the effective reduction.
   */
  public reduceCooldown(
    spellId: number,
    reductionMs: number,
    timestamp: number = this.owner.currentTimestamp,
  ): number {
    // get cooldown info
    const cdSpellId = this._getCanonicalId(spellId);
    const cdInfo = this._currentCooldowns[cdSpellId];
    if (!cdInfo) {
      // Nothing to reduce, the spell isn't on cooldown
      DEBUG &&
        console.info(
          'Tried to reduce cooldown of ' + spellName(spellId) + ", but it wasn't on cooldown",
        );
      return 0;
    }

    let effectiveReductionMs = reductionMs;
    /*
     * Applying a time-based reduction interacts differently with haste and modRate.
     * Haste does not scale the time-based reduction, while modRate does.
     * For example, consider a cooldown which can benefit from haste and modRate which has
     * a base cooldown of 8 seconds, and that as soon as it goes on cooldown its remaining cooldown
     * is reduced by 2 seconds.
     * Case 1: no haste or modRate : cooldown finishes at 6 seconds
     * Case 2: +100% haste, no modRate : cooldown finishes at 2 seconds
     * Case 3: no haste, +100% modRate : cooldown finishes at 3 seconds
     */
    // calculate and apply reduction
    const modRate = this._getSpellModRate(cdSpellId);
    const scaledReductionMs = reductionMs / modRate;
    cdInfo.expectedEnd -= scaledReductionMs;

    // if this restores a charge or ends the cooldown, we need to handle that
    if (timestamp >= cdInfo.expectedEnd) {
      const carryoverCdr = timestamp - cdInfo.expectedEnd;

      // calculate effective reduction based on unscaled amount
      if (cdInfo.maxCharges - cdInfo.chargesAvailable === 1) {
        // this reduction will end the cooldown, so some of it will be wasted
        const scaledEffectiveReduction = scaledReductionMs - carryoverCdr;
        effectiveReductionMs = scaledEffectiveReduction * modRate;
      }

      this._resetCooldown(cdSpellId, cdInfo, timestamp, carryoverCdr);
      this.endCooldown(spellId, timestamp); // we reset CD here, so don't want end cooldown to do it too
    }

    DEBUG &&
      console.log(
        'Reduced cooldown of ' +
          spellName(cdSpellId) +
          ' by ' +
          reductionMs +
          ' (effective:' +
          effectiveReductionMs +
          ')',
      );

    return effectiveReductionMs;
  }

  /**
   * Change the rate at which a spell's cooldown recovers. By default,
   * cooldowns recover at a rate of 1, e.g. "one second per second".
   * Effects that increase (or decrease) the ability cooldown rate
   * (sometimes referred to as "modRate") can modify this.
   * @param {number | number[] | 'ALL'} spellId The ID or IDs of the spell to change,
   *     or 'ALL' if you want to change the cooldown rate of all spells.
   * @param {number} rateMultiplier the multiplier to apply to a spell's cooldown rate.
   *     For example, an effect that "increases cooldown recovery rate by 15%" would
   *     require a rateMultiplier of 1.15.
   * @param {number} timestamp the timestamp on which the cooldown rate change was applied,
   *     if different from currentTimestamp.
   */
  public applyCooldownRateChange(
    spellId: number | number[] | 'ALL',
    rateMultiplier: number,
    timestamp: number = this.owner.currentTimestamp,
  ) {
    let oldRate, newRate;
    if (typeof spellId === 'string') {
      // ALL
      oldRate = this._globalModRate;
      newRate = oldRate * rateMultiplier;
      const changeRate = newRate / oldRate;
      this._globalModRate = newRate;

      Object.entries(this._currentCooldowns).forEach(([spellId, cdInfo]) => {
        this._handleChangeRate(Number(spellId), cdInfo, timestamp, changeRate);
      });
    } else {
      const ids: number[] = typeof spellId === 'number' ? [spellId] : spellId;
      ids.forEach((id) => {
        const cdSpellId = this._getCanonicalId(id);
        oldRate = this._spellModRates[cdSpellId] || 1;
        newRate = oldRate * rateMultiplier;
        const changeRate = newRate / oldRate;
        this._spellModRates[cdSpellId] = newRate;

        const cdInfo = this._currentCooldowns[cdSpellId];
        if (cdInfo) {
          this._handleChangeRate(cdSpellId, cdInfo, timestamp, changeRate);
        }
      });
    }

    DEBUG &&
      console.log(
        'Applied modRate to ' +
          spellId +
          ' of ' +
          rateMultiplier +
          ' - ' +
          'oldRate:' +
          oldRate +
          ' newRate:' +
          newRate,
      );
  }

  /**
   * {@link applyCooldownRateChange} with an inverted rateMultiplier.
   * Intended to make it easier to handle cooldown rate changes that are added and removed by a buff.
   */
  public removeCooldownRateChange(
    spellId: number | number[] | 'ALL',
    rateMultiplier: number,
    timestamp: number = this.owner.currentTimestamp,
  ) {
    this.applyCooldownRateChange(spellId, 1 / rateMultiplier, timestamp);
  }

  /////////////////////////////////////////////////////////////////////////////
  // EVENT HANDLERS -
  // Handle events to update cooldown info
  //

  /** On every event, we need to check if an existing tracked cooldown has expired */
  protected onEvent(event: AnyEvent) {
    // TODO handle FilterCooldownInfo?
    const currentTimestamp = event.timestamp;

    Object.entries(this._currentCooldowns).forEach(([spellId, cdInfo]) => {
      if (cdInfo.expectedEnd <= currentTimestamp) {
        this.endCooldown(Number(spellId), cdInfo.expectedEnd, true);
      }
    });
  }

  /** On every cast, we need to start the spell's cooldown if it has one */
  protected onCast(event: CastEvent | FilterCooldownInfoEvent) {
    this.beginCooldown(event);
  }

  /** On every change in haste, we need to check each active cooldown to see if the
   *  remaining time needs to be adjusted (if the cooldown scales with haste) */
  protected onChangeHaste(event: ChangeHasteEvent) {
    DEBUG &&
      console.log(
        'Haste changed from ' +
          formatPercentage(event.oldHaste) +
          ' to ' +
          formatPercentage(event.newHaste) +
          ' @ ' +
          this.owner.formatTimestamp(event.timestamp, 1) +
          ' - updating cooldowns',
      );
    Object.entries(this._currentCooldowns).forEach(([spellId, cdInfo]) => {
      const orignalDuration = cdInfo.expectedDuration;
      const newDuration = this._getExpectedCooldown(Number(spellId), true);
      if (orignalDuration !== newDuration) {
        // only need to adjust if CD changed
        const changeRate = orignalDuration / newDuration;
        this._handleChangeRate(Number(spellId), cdInfo, event.timestamp, changeRate);
      }
    });
  }

  /** Update cooldown info for changed number of max charges */
  protected onMaxChargesIncreased(event: MaxChargesIncreasedEvent) {
    const cdInfo = this._currentCooldowns[this._getCanonicalId(event.spellId)];
    if (cdInfo) {
      cdInfo.maxCharges += event.by;
    }
  }

  /** Update cooldown info for changed number of max charges */
  protected onMaxChargesDecreased(event: MaxChargesDecreasedEvent) {
    const cdInfo = this._currentCooldowns[this._getCanonicalId(event.spellId)];
    if (cdInfo) {
      cdInfo.maxCharges -= event.by;
      if (cdInfo.maxCharges <= cdInfo.chargesAvailable) {
        this.endCooldown(event.spellId, event.timestamp);
      }
    }
  }

  /** On fight end, close out each cooldown at its expected end time */
  protected onFightEnd(event: FightEndEvent) {
    Object.entries(this._currentCooldowns).forEach(([spellId, cdInfo]) => {
      // does an end cooldown rather than restore charge ... FIXME will this matter?
      this.endCooldown(Number(spellId), cdInfo.expectedEnd, true, true);
    });
  }

  /////////////////////////////////////////////////////////////////////////////
  // PRIVATE HELPERS -
  // Helper methods intended for internal use only
  //

  /**
   * Gets the canonical spell ID for an ability. For most abilities, this is just the spell ID.
   * Some abilities have multiple IDs associated with the same spell / cooldown -
   * this will return the first ability from the list of abilities sharing the cooldown.
   */
  private _getCanonicalId(spellId: number): number {
    const ability = this.abilities.getAbility(spellId);
    return ability ? ability.primarySpell : spellId;
  }

  /**
   * Gets a spell's current cooldown rate or 'modRate'.
   * @param canonicalSpellId the spell ID to check (MUST be the ability's primary ID)
   */
  private _getSpellModRate(canonicalSpellId: number): number {
    return this._globalModRate * (this._spellModRates[canonicalSpellId] || 1);
  }

  /**
   * Gets a spell's expected cooldown at the current time, including modRate.
   * @param canonicalSpellId the spell ID to check (MUST be the ability's primary ID)
   * @param forceCheckAbilites iff true, cooldown will be pulled from Abilities even if there
   *     is a cached value in cdInfo
   */
  private _getExpectedCooldown(
    canonicalSpellId: number,
    forceCheckAbilites: boolean = false,
  ): number {
    const cdInfo = this._currentCooldowns[canonicalSpellId];
    if (cdInfo && !forceCheckAbilites) {
      // cdInfo always kept up to date
      return cdInfo.expectedDuration;
    } else {
      const unscaledCooldown = this.abilities.getExpectedCooldownDuration(canonicalSpellId);
      // always integer number of milliseconds
      return !unscaledCooldown
        ? 0
        : Math.round(unscaledCooldown / this._getSpellModRate(canonicalSpellId));
    }
  }

  /**
   * Updates cdInfo's expectedDuration and expectedEnd fields to account for a change in
   * the cooldown's rate. This calculation is the same for modRate and haste changes.
   */
  private _handleChangeRate(
    spellId: number,
    cdInfo: CooldownInfo,
    timestamp: number,
    changeRate: number,
  ) {
    // assumes expectedEnd is still after timestamp!
    const timeLeft = cdInfo.expectedEnd - timestamp;
    const percentageLeft = timeLeft / cdInfo.expectedDuration;
    const newExpectedDuration = cdInfo.expectedDuration / changeRate;
    const newTimeLeft = newExpectedDuration * percentageLeft;
    const newExpectedEnd = timestamp + newTimeLeft;

    DEBUG &&
      console.log(
        'Cooldown changed for active CD ' +
          spellName(spellId) +
          ' - old CD: ' +
          cdInfo.expectedDuration +
          ' - new CD: ' +
          newExpectedDuration +
          ' / old expectedEnd: ' +
          this.owner.formatTimestamp(cdInfo.expectedEnd, 1) +
          ' - new expectedEnd: ' +
          this.owner.formatTimestamp(newExpectedEnd, 1),
      );

    cdInfo.expectedDuration = newExpectedDuration;
    cdInfo.expectedEnd = newExpectedEnd;
  }

  /**
   * Resets a spell's cooldown so that the new cooldown begins at the given timestamp.
   * This does NOT increment the charge count or fabricate events,
   * the caller is responsible for that.
   * @param canonicalSpellId the spell's canonical ID
   * @param cdInfo the cooldown to reset
   * @param timestamp the timestamp to reset starting from
   * @param carryoverCdr any CDR to 'carry over' from the previous cooldown, in milliseconds.
   */
  private _resetCooldown(
    canonicalSpellId: number,
    cdInfo: CooldownInfo,
    timestamp: number,
    carryoverCdr: number = 0,
  ) {
    const expectedCooldownDuration = this._getExpectedCooldown(canonicalSpellId);
    if (!expectedCooldownDuration) {
      // shouldn't be possible to get here
      console.error(
        'Somehow tried to reset cooldown of ability that has a CooldownInfo, but no cooldown...',
        cdInfo,
      );
      return;
    }
    cdInfo.expectedDuration = expectedCooldownDuration;
    cdInfo.expectedEnd = timestamp + expectedCooldownDuration - carryoverCdr;
  }

  /**
   * Fabricates an UpdateSpellUsableEvent and inserts it into the events stream
   * @param {UpdateSpellUsableType} updateType the type of update this is
   * @param {number} spellId the ID of the fabricated event
   * @param {number} timestamp the timestamp of the fabricated event
   * @param {CooldownInfo} info the cooldown info object pertaining to this spell
   *     (after the appropriate updates have been calculated)
   */
  private _fabricateUpdateSpellUsableEvent(
    updateType: UpdateSpellUsableType,
    spellId: number,
    timestamp: number,
    info: CooldownInfo,
  ) {
    const spell = SPELLS[spellId];

    const event: UpdateSpellUsableEvent = {
      type: EventType.UpdateSpellUsable,
      timestamp,
      ability: {
        guid: spellId,
        name: spell.name ?? '',
        abilityIcon: spell.icon ?? '',
      },
      updateType,
      isOnCooldown: info.maxCharges > info.chargesAvailable,
      isAvailable: info.chargesAvailable > 0,
      chargesAvailable: info.chargesAvailable,
      maxCharges: info.maxCharges,
      overallStartTimestamp: info.overallStart,
      expectedRechargeTimestamp: info.expectedEnd,
      expectedRechargeDuration: info.expectedDuration,
      // timeWaitingOnGCD filled in by another modules

      sourceID: this.owner.selectedCombatant.id,
      sourceIsFriendly: true,
      targetID: this.owner.selectedCombatant.id,
      targetIsFriendly: true,

      __fabricated: true,
    };

    DEBUG &&
      console.log(
        updateType + ' on ' + spellName(spellId) + ' @ ' + this.owner.formatTimestamp(timestamp, 1),
      );

    this.eventEmitter.fabricateEvent(event);
  }
}

export default SpellUsable;
