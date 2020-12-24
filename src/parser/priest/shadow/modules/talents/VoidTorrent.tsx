import React from 'react';

import SPELLS from 'common/SPELLS/index';
import SpellLink from 'common/SpellLink';
import Analyzer, { Options, SELECTED_PLAYER } from 'parser/core/Analyzer';
import { ThresholdStyle, When } from 'parser/core/ParseResults';
import Events, { CastEvent, DamageEvent, RemoveBuffEvent, EnergizeEvent } from 'parser/core/Events';
import Statistic from 'interface/statistics/Statistic';
import STATISTIC_CATEGORY from 'interface/others/STATISTIC_CATEGORY';
import BoringSpellValueText from 'interface/statistics/components/BoringSpellValueText';
import ItemDamageDone from 'interface/ItemDamageDone';
import { t } from '@lingui/macro';
import Insanity from 'interface/icons/Insanity'
import { formatNumber } from 'common/format';

import { MS_BUFFER, VOID_TORRENT_MAX_TIME, VOID_TORRENT_INSANITY_PER_SECOND } from '../../constants';

function formatSeconds(seconds: number) {
  return Math.round(seconds * 10) / 10;
}

// Example Log: /report/jcHgC7bfNAMqtRFv/12-Mythic+Hungering+Destroyer+-+Kill+(6:41)/Adoraci/standard/statistics
class VoidTorrent extends Analyzer {

  _previousVoidTorrentCast: any;
  damage: number = 0;
  totalChannelingTime = 0;
  insanityGained: number = 0;

  constructor(options: Options) {
    super(options);
    this.active = this.selectedCombatant.hasTalent(SPELLS.VOID_TORRENT_TALENT.id);
    this.addEventListener(Events.cast.by(SELECTED_PLAYER).spell(SPELLS.VOID_TORRENT_TALENT), this.onCast);
    this.addEventListener(Events.removebuff.by(SELECTED_PLAYER).spell(SPELLS.VOID_TORRENT_TALENT), this.onBuffRemoved);
    this.addEventListener(Events.damage.by(SELECTED_PLAYER).spell(SPELLS.VOID_TORRENT_TALENT), this.onDamage);
    this.addEventListener(Events.energize.by(SELECTED_PLAYER).spell(SPELLS.VOID_TORRENT_BUFF), this.onEnergize);
  }

  _voidTorrents: any = {};

  get voidTorrents() {
    return Object.keys(this._voidTorrents).map(key => this._voidTorrents[key]);
  }

  get timeWasted() {
    return this.voidTorrents.reduce((total, c) => total + c.wastedTime, 0) / 1000;
  }

  get insanityWasted() {
    return this.timeWasted * VOID_TORRENT_INSANITY_PER_SECOND;
  }

  get insanityOvercapped() {
    // Can't use the Energize event's waste because it shows 0 for some reason even if you overcap, so we calculate based on the time channeling vs. how much sanity you should've gotten from it
    return ((this.totalChannelingTime / 1000) * VOID_TORRENT_INSANITY_PER_SECOND) - this.insanityGained;
  }

  onCast(event: CastEvent) {
    this._voidTorrents[event.timestamp] = {
      start: event.timestamp,
    };

    this._previousVoidTorrentCast = event;
  }

  onBuffRemoved(event: RemoveBuffEvent) {
    const timeSpentChanneling = event.timestamp - this._previousVoidTorrentCast.timestamp;
    const wastedTime = (VOID_TORRENT_MAX_TIME - MS_BUFFER) > timeSpentChanneling ? (VOID_TORRENT_MAX_TIME - timeSpentChanneling) : 0;
    this.totalChannelingTime += (VOID_TORRENT_MAX_TIME - wastedTime);

    this._voidTorrents[this._previousVoidTorrentCast.timestamp] = {
      ...this._voidTorrents[this._previousVoidTorrentCast.timestamp],
      wastedTime,
      end: event.timestamp,
    };

    this._previousVoidTorrentCast = null;
  }

  onDamage(event: DamageEvent) {
    this.damage += event.amount || 0;
  }

  onEnergize(event: EnergizeEvent) {
    this.insanityGained += event.resourceChange;
  }

  suggestions(when: When) {
    when({
        actual: this.timeWasted,
        isGreaterThan: {
          minor: 0.2,
          average: 0.5,
          major: 2,
        },
        style: ThresholdStyle.SECONDS,
      })
      .addSuggestion((suggest, actual, recommended) => suggest(<>You interrupted <SpellLink id={SPELLS.VOID_TORRENT_TALENT.id} /> early, wasting {formatSeconds(this.timeWasted)} channeling seconds! Try to position yourself & time it so you don't get interrupted due to mechanics.</>)
        .icon(SPELLS.VOID_TORRENT_TALENT.icon)
        .actual(t({
          id: "priest.shadow.suggestions.voidTorrent.secondsLost",
          message: `Lost ${formatSeconds(actual)} seconds of Void Torrent.`
        }))
    .recommended('No time wasted is recommended.'));

    when({
      actual: this.insanityOvercapped,
      isGreaterThan: {
        minor: 5,
        average: 10,
        major: 20,
      },
      style: ThresholdStyle.NUMBER,
    })
      .addSuggestion((suggest, actual, recommended) => suggest(<>You lost a total of {formatNumber(actual)} insanity by channeling <SpellLink id={SPELLS.VOID_TORRENT_TALENT.id} /> at full insanity. Make sure that you are below 40 insanity before channeling to maximize insanity gain. If you are between 40 and 50 insanity, you should get above 50 and use <SpellLink id={SPELLS.DEVOURING_PLAGUE.id} /> before channeling.</>)
      .icon(SPELLS.VOID_TORRENT_TALENT.icon)
      .actual(t({
        id: "priest.shadow.suggestions.voidTorrent.insanityOvercapped",
        message: `Wasted ${formatNumber(actual)} insanity from overcapping.`
      }))
    .recommended('No insanity wasted is recommended.'));
  }

  statistic() {
    return (
      <Statistic
        category={STATISTIC_CATEGORY.TALENTS}
        size="flexible"
        tooltip={(
          <>
            {formatSeconds(this.timeWasted)} seconds wasted by cancelling the channel early. <br />
            {formatNumber(this.insanityWasted)} insanity wasted by cancelling the channel early. <br /><br />
            {formatNumber(this.insanityOvercapped)} insanity wasted by overcapping sanity.
          </>
        )}
      >
        <BoringSpellValueText spell={SPELLS.VOID_TORRENT_TALENT}>
          <>
            <ItemDamageDone amount={this.damage} /> <br />
            <Insanity /> {this.insanityGained} <small>Insanity gained</small>
          </>
        </BoringSpellValueText>
      </Statistic>
    );
  }
}

export default VoidTorrent;
