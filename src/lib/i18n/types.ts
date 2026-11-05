/** A translated message. `{name}` placeholders are filled from TranslateParams. */
export type MessageValue = string;

/** One / other forms selected with Intl.PluralRules. */
export interface PluralForms {
  one: string;
  other: string;
}

export type MessageNode = MessageValue | PluralForms | MessageTree;

export interface MessageTree {
  [key: string]: MessageNode;
}

export type TranslateParams = Record<string, string | number>;

/** Dot paths to every string / plural leaf in a message tree. */
export type DeepMessageKey<T> = T extends string | PluralForms
  ? never
  : {
      [K in keyof T & string]: T[K] extends string | PluralForms ? K : `${K}.${DeepMessageKey<T[K]>}`;
    }[keyof T & string];
