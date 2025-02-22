import { t } from '@lingui/macro';
import { formatPercentage } from 'common/format';
import { SpellLink } from 'interface';
import DebuffUptime from 'parser/shared/modules/DebuffUptime';
import { ThresholdStyle, When } from 'parser/core/ParseResults';
import uptimeBarSubStatistic from 'parser/ui/UptimeBarSubStatistic';
import SPELLS from 'common/SPELLS/classic/warlock';
import { SPELL_COLORS } from '../../constants';

export default class CorruptionUptime extends DebuffUptime {
  debuffSpell = SPELLS.CORRUPTION;
  debuffColor = SPELL_COLORS.CORRUPTION;

  get debuffUptime(): number {
    return this.enemies.getBuffUptime(this.debuffSpell.id) / this.owner.fightDuration;
  }

  get suggestionThresholds() {
    return {
      actual: this.debuffUptime,
      isLessThan: {
        minor: 0.85,
        average: 0.8,
        major: 0.75,
      },
      style: ThresholdStyle.PERCENTAGE,
    };
  }

  suggestions(when: When) {
    when(this.suggestionThresholds).addSuggestion((suggest, actual, recommended) =>
      suggest(
        <>
          Your <SpellLink spell={this.debuffSpell} /> uptime can be improved. If necessary, use a
          debuff tracker to see your uptime on the boss.
        </>,
      )
        .icon(this.debuffSpell.icon)
        .actual(
          t({
            id: 'shared.suggestions.spells.uptime',
            message: `${formatPercentage(actual)}% ${this.debuffSpell.name} uptime`,
          }),
        )
        .recommended(`>${formatPercentage(recommended)}% is recommended`),
    );
  }

  get uptimeHistory() {
    return this.enemies.getDebuffHistory(this.debuffSpell.id);
  }

  subStatistic() {
    return uptimeBarSubStatistic(this.owner.fight, {
      spells: [this.debuffSpell],
      uptimes: this.uptimeHistory,
      color: this.debuffColor,
      perf: this.DowntimePerformance,
    });
  }
}
