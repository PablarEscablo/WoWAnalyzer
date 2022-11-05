import SPELLS from 'common/SPELLS';
import { TALENTS_SHAMAN } from 'common/TALENTS';

const spells: number[] = [
  /**
   * This can consist of boss mechanics marked as casts, buff applications marked
   * as separate casts from the normal ability, toy casts that some people macro
   * into their abilities and so forth
   */
  SPELLS.MELEE.id, // Auto attack
  SPELLS.CHI_BURST_HEAL.id, // this is the "tick" when you hit a player, the actual cast has a different id
  SPELLS.REFRESHING_JADE_WIND_HEAL.id, // this is the "tick" when you hit a player, the actual cast has a different id
  SPELLS.SHADOWY_APPARITION.id,
  SPELLS.SHADOWY_APPARITION_CAST.id, // Shadow priest shadow apparitions passive
  SPELLS.PRIMAL_FURY.id, // Feral Druid "extra CP on crit" proc causes a cast event
  SPELLS.BLOW_DARKMOON_WHISTLE.id, //Darkmoon Whistle active that some people macro into abilities
  SPELLS.DARKMOON_FIREWORK.id, //Darkmoon Firework toy
  SPELLS.BIG_RED_RAYS.id, //Big Red Raygun active effect
  SPELLS.FRACTURE_MAIN_HAND.id, // Fracture main hand damage ability
  SPELLS.FRACTURE_OFF_HAND.id, // Fracture off hand damage ability
  SPELLS.SOUL_FRAGMENT_KILLING_BLOW.id, // Soul Fragment that are sometimes generated by killing blows (it does not affect much of a rotation, because it's usually ~1:200, comparing to usual soul fragment generation)
  SPELLS.MUTILATE_OFFHAND.id, // Mutilate off hand
  SPELLS.DIVINE_HYMN_HEAL.id, //The heal component of divine hymn
  SPELLS.CHARGE_2.id, // The damage component of charge
  SPELLS.CLOUDBURST_TOTEM_RECALL.id, // Cloudburst reactivation
  TALENTS_SHAMAN.SPIRITWALKERS_GRACE_TALENT.id,
  //endregion

  //region Consumables
  SPELLS.SHADOWCORE_OIL_BLAST.id,
  //endregion

  //region Enchants
  SPELLS.SINFUL_REVELATION_PROC.id,
  SPELLS.CELESTIAL_GUIDANCE_CAST.id,

  //region Death Knight
  SPELLS.BREATH_OF_SINDRAGOSA_TALENT_DAMAGE_TICK.id,
  SPELLS.RUNE_1.id,
  SPELLS.RUNE_2.id,
  SPELLS.RUNE_3.id,
  SPELLS.ABOMINATION_LIMB_HIDDEN_CAST.id,
  SPELLS.ABOMINATION_LIMB_GRIP.id,
  SPELLS.ABOMINATION_LIMB_TICK.id,
  SPELLS.ABOMINATION_LIMB_GRIP_TICK.id,
  //endregion

  //region Hunter
  SPELLS.BARBED_SHOT_PET_BUFF.id, //The buff applied to BM Hunter pet when casting Barbed Shot
  SPELLS.DIRE_BEAST_SUMMON.id, //Additional cast event associated with summoning a Dire Beast
  //endregion

  //region Mage
  SPELLS.RUNE_OF_POWER_BUFF.id,
  SPELLS.DISCIPLINARY_COMMAND_BUFF.id,

  //region Covenants
  SPELLS.COMBAT_MEDITATION_TRIGGER.id, //The Spell ID when Combat Meditation from Kyrian Soulbind triggers, so that there is now a soul ready to pick up
  SPELLS.COMBAT_MEDITATION_PICK_UP.id, //The Spell ID that is "cast" when an orb is picked up
  SPELLS.SOOTHING_SHADE.id, //The Spell ID when Theotar's soulbind proc "casts"
  //endregion

  //region Demon Hunter
  SPELLS.FELBLADE_DAMAGE.id, //The spell that generates fury when casting
  //endregion

  //region druid
  SPELLS.TRANQUILITY_HEAL.id,
  //endregion

  //region trinket
  SPELLS.CARVED_IVORY_KEEPSAKE.id,
  SPELLS.ANIMA_FIELD_EMITTER_BUFF.id,
  //endregion
];

export default spells;
