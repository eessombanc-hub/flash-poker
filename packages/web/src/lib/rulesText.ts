import { tr } from '../i18n';

/** Mémo des règles : reprend le document de règles v1.1 validé. Aucune règle n'est ajoutée ici. */
export const COMMON_RULES: { title: string; text: string }[] = [
  { get title() { return tr('rules.0.title'); }, get text() { return tr('rules.0.text'); } },
  { get title() { return tr('rules.1.title'); }, get text() { return tr('rules.1.text'); } },
  { get title() { return tr('rules.2.title'); }, get text() { return tr('rules.2.text'); } },
  { get title() { return tr('rules.3.title'); }, get text() { return tr('rules.3.text'); } },
  { get title() { return tr('rules.4.title'); }, get text() { return tr('rules.4.text'); } },
  { get title() { return tr('rules.5.title'); }, get text() { return tr('rules.5.text'); } },
  { get title() { return tr('rules.6.title'); }, get text() { return tr('rules.6.text'); } },
  { get title() { return tr('rules.7.title'); }, get text() { return tr('rules.7.text'); } },
  { get title() { return tr('rules.8.title'); }, get text() { return tr('rules.8.text'); } },
  { get title() { return tr('rules.9.title'); }, get text() { return tr('rules.9.text'); } },
];
