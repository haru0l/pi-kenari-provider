import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
declare const generateImageParams: Type.TObject<{
    prompt: Type.TString;
    model: Type.TOptional<Type.TString>;
    n: Type.TOptional<Type.TInteger>;
    size: Type.TOptional<Type.TString>;
    quality: Type.TOptional<Type.TUnion<[Type.TLiteral<"standard">, Type.TLiteral<"hd">]>>;
    style: Type.TOptional<Type.TUnion<[Type.TLiteral<"natural">, Type.TLiteral<"vivid">]>>;
    background: Type.TOptional<Type.TUnion<[Type.TLiteral<"opaque">, Type.TLiteral<"auto">]>>;
    output: Type.TOptional<Type.TString>;
}>;
export interface GenerateImageDetails {
    model: string;
    prompt: string;
    /** Files written, relative to the working directory. */
    files: string[];
    /** Bytes written per file, in the same order. */
    bytes: number[];
    /** Per-image rewrite of the prompt, when the model returns one. */
    revisedPrompts: string[];
}
/**
 * The `generate_image` tool. Like `system_one`, it reads kenari credentials from
 * the model registry rather than holding a key of its own.
 */
export declare const generateImageTool: ToolDefinition<typeof generateImageParams, GenerateImageDetails>;
export {};
//# sourceMappingURL=image.d.ts.map