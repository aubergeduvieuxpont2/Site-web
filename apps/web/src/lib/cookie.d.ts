declare module 'cookie' {
  export interface CookieParseOptions {
    decode?: (str: string) => string | undefined;
  }

  export interface CookieSerializeOptions {
    encode?: (str: string) => string;
    domain?: string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    priority?: 'low' | 'medium' | 'high';
    sameSite?: boolean | 'lax' | 'strict' | 'none';
    secure?: boolean;
  }
}
