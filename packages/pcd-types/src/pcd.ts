/**
 * This type represents the core idea of the PCD ecosystem.
 * This is an atomic piece of self-evident data.
 */
export interface PCD<C = unknown, P = unknown> {
  id: string;
  type: string;
  claim: C;
  proof: P;
}

/**
 * Each type of {@link PCD} has a corresponding {@link PCDPackage}. The
 * {@link PCDPackage} of a {@link PCD} type defines the code necessary to
 * derive meaning from and operate on the data within a {@link PCD}.
 *
 * @typeParam {@link C} the type of {@link PCD.claim} for the {@link PCD} encapsulated by this {@link PCDPackage}
 * @typeParam {@link P} the type of {@link PCD.proof} for the {@link PCD} encapsulated by this {@link PCDPackage}
 * @typeParam {@link A} the type of the arguments passed into {@link PCDPackage#prove} to instantiate a new {@link PCD}
 * @typeparam {@link I} the type of the arguments passed into {@link PCDPackage#init}, if the init function is present to instantiate a new {@link PCD}
 */
export interface PCDPackage<C = any, P = any, A = any, I = any> {
  /**
   * The unique name identifying the type of {@link PCD} this package encapsulates.
   */
  name: string;

  /**
   * Intended for use by PCDpass. Given a {@link PCD}, returns some information about
   * how this {@link PCD} should be displayed to the user within the passport app.
   */
  getDisplayOptions?: (pcd: PCD<C, P>) => DisplayOptions;

  /**
   * Intended to be used by PCDpass. Given a {@link PCD}, renders the body of a card
   * that appears in PCDpass representing this {@link PCD}.
   */
  renderCardBody?: ({
    pcd,
    returnHeader
  }: {
    pcd: PCD<C, P>;
    returnHeader?: boolean;
  }) => React.ReactElement;
  init?: (initArgs: I) => Promise<void>;
  prove(args: A): Promise<PCD<C, P>>;
  verify(pcd: PCD<C, P>): Promise<boolean>;
  serialize(pcd: PCD<C, P>): Promise<SerializedPCD<PCD<C, P>>>;
  deserialize(seralized: string): Promise<PCD<C, P>>;
}

/**
 *
 */
export interface SerializedPCD<_T extends PCD = PCD> {
  type: string;
  pcd: string;
}

export type ArgsOf<T> = T extends PCDPackage<any, any, infer U, any> ? U : T;
export type PCDOf<T> = T extends PCDPackage<infer C, infer P, any, any>
  ? PCD<C, P>
  : T;

/**
 * This interface can be optionally returned by the package ƒor any given
 * PCD, which allows the package some degree of control over how the PCD
 * is displayed in the passport application.
 */
export interface DisplayOptions {
  /**
   * Shown to the user in the main page of the passport, where they can
   * see all of their cards. If `header` is undefined, the passport will use
   * `renderCardBody` with `returnHeader` set to true.
   */
  header?: string;

  /**
   * Shown to the user in the `GenericProveScreen`, allowing them to
   * disambiguate between different pcds of the same type. In the future,
   * we'll have a better way to disambiguate between them.
   */
  displayName?: string;
}

export enum ArgumentTypeName {
  String = "String",
  Number = "Number",
  BigInt = "BigInt",
  Boolean = "Boolean",
  Object = "Object",
  StringArray = "StringArray",
  PCD = "PCD",
  Unknown = "Unknown"
}

export interface Argument<
  TypeName extends ArgumentTypeName,
  ValueType = unknown
> {
  argumentType: TypeName;
  value?: ValueType;
  remoteUrl?: string;
  userProvided?: boolean;
  description?: string;
}

export type StringArgument = Argument<ArgumentTypeName.String, string>;
export function isStringArgument(
  arg: Argument<any, unknown>
): arg is StringArgument {
  return arg.argumentType === ArgumentTypeName.String;
}

export type NumberArgument = Argument<ArgumentTypeName.Number, string>;
export function isNumberArgument(
  arg: Argument<any, unknown>
): arg is NumberArgument {
  return arg.argumentType === ArgumentTypeName.Number;
}

export type BigIntArgument = Argument<ArgumentTypeName.BigInt, string>;
export function isBigIntArgument(
  arg: Argument<any, unknown>
): arg is BigIntArgument {
  return arg.argumentType === ArgumentTypeName.BigInt;
}

export type BooleanArgument = Argument<ArgumentTypeName.Boolean, boolean>;
export function isBooleanArgument(
  arg: Argument<any, unknown>
): arg is BooleanArgument {
  return arg.argumentType === ArgumentTypeName.Boolean;
}

export type ObjectArgument<T> = Argument<ArgumentTypeName.Object, T>;
export function isObjectArgument(
  arg: Argument<any, unknown>
): arg is ObjectArgument<unknown> {
  return arg.argumentType === ArgumentTypeName.Object;
}

export type StringArrayArgument = Argument<
  ArgumentTypeName.StringArray,
  string[]
>;
export function isStringArrayArgument(
  arg: Argument<any, unknown>
): arg is StringArrayArgument {
  return arg.argumentType === ArgumentTypeName.StringArray;
}

export type PCDArgument<T extends PCD = PCD> = Argument<
  ArgumentTypeName.PCD,
  SerializedPCD<T>
> & {
  pcdType?: string;
};
export function isPCDArgument(arg: Argument<any, unknown>): arg is PCDArgument {
  return arg.argumentType === ArgumentTypeName.PCD;
}
