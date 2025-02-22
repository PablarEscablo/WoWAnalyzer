import {
  DivinePurpose,
  HolyPowerTracker,
  HolyPowerDetails,
  Judgment,
  HolyPowerPerMinute,
} from 'analysis/retail/paladin/shared';
import CoreCombatLogParser from 'parser/core/CombatLogParser';

import Abilities from './modules/Abilities';
import Buffs from './modules/Buffs';
import ArtOfWar from './modules/core/ArtOfWar';
import ArtOfWarProbability from './modules/core/ArtOfWarProbability';
import BladeofJustice from './modules/core/BladeofJustice';
import Consecration from './modules/core/Consecration';
import CrusaderStrike from './modules/core/CrusaderStrike';
import HammerofWrathRetribution from './modules/core/HammerofWrath';
import ShieldOfVengeance from './modules/core/ShieldOfVengeance';
import WakeofAshes from './modules/core/WakeofAshes';
import AlwaysBeCasting from './modules/features/AlwaysBeCasting';
import Checklist from './modules/features/Checklist/Module';
import CooldownThroughputTracker from './modules/features/CooldownThroughputTracker';
import FinalVerdict from './modules/items/FinalVerdict';
import Crusade from './modules/talents/Crusade';
import EmpyreanPower from './modules/talents/EmpyreanPower';

class CombatLogParser extends CoreCombatLogParser {
  static specModules = {
    // PaladinCore
    artOfWar: ArtOfWar,
    artOfWarProbability: ArtOfWarProbability,

    // Features
    abilities: Abilities,
    alwaysBeCasting: AlwaysBeCasting,
    buffs: Buffs,
    cooldownThroughputTracker: CooldownThroughputTracker,
    checklist: Checklist,
    bladeofJustice: BladeofJustice,
    crusaderStrike: CrusaderStrike,
    shieldOfVengeance: ShieldOfVengeance,
    judgment: Judgment,

    // Talents
    divinePurpose: DivinePurpose,
    crusade: Crusade,
    wakeofAshes: WakeofAshes,
    consecration: Consecration,
    hammerofWrathRetribution: HammerofWrathRetribution,
    empyreanPower: EmpyreanPower,

    // HolyPower
    holyPowerTracker: HolyPowerTracker,
    holyPowerDetails: HolyPowerDetails,
    holyPowerPerMinute: HolyPowerPerMinute,

    // Items
    finalVerdict: FinalVerdict,
  };
}

export default CombatLogParser;
