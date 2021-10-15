import * as SPELLS from './SPELLS';

export default {
  [SPELLS.AMBUSH]: [11269, 11268, 11267, 8725, 8724, 8676],
  [SPELLS.ANESTHETIC_POISON]: [26786],
  [SPELLS.BACKSTAB]: [11281, 25300, 11280, 11279, 8721, 2591, 2590, 2589, 53],
  [SPELLS.CRIPPLING_POISON_II]: [3775],
  [SPELLS.DEADLY_POISON_VII]: [2892, 2893, 8984, 8985, 20844, 22053],
  [SPELLS.ENVENOM]: [32645],
  [SPELLS.EVASION]: [5277],
  [SPELLS.EVISCERATE]: [31016, 11300, 11299, 8624, 8623, 6762, 6761, 6760, 2098],
  [SPELLS.EXPOSE_ARMOR]: [11198, 11197, 8650, 8649, 8647],
  [SPELLS.FEINT]: [25302, 11303, 8637, 6768, 1966],
  [SPELLS.FIND_WEAKNESS]: [31236, 31234],
  [SPELLS.GARROTE]: [26839, 11290, 11289, 8633, 8632, 8631, 703],
  [SPELLS.GOUGE]: [11286, 11285, 8629, 1777, 1776],
  [SPELLS.INSTANT_POISON_VII]: [6947, 6949, 6950, 8926, 8927, 8928],
  [SPELLS.KICK]: [1769, 1768, 1767, 1766],
  [SPELLS.KIDNEY_SHOT]: [408],
  [SPELLS.MIND_NUMBING_POISON_III]: [5237, 6951],
  [SPELLS.MUTILATE]: [34412, 34411],
  [SPELLS.RUPTURE]: [11275, 11274, 11273, 8640, 8639, 1943],
  [SPELLS.SAP]: [2070, 6770],
  [SPELLS.SINISTER_STRIKE]: [26861, 11294, 11293, 8621, 1760, 1759, 1758, 1757, 1752],
  [SPELLS.SLICE_AND_DICE]: [5171],
  [SPELLS.SPRINT]: [8696, 2983],
  [SPELLS.STEALTH]: [1786, 1785, 1784],
  [SPELLS.VANISH]: [1857, 1856],
  [SPELLS.WOUND_POISON_V]: [10918, 10920, 10921, 10922],
};

export const whitelist = {};

export interface LowRankSpells {
  [primarySpellId: number]: number[];
}