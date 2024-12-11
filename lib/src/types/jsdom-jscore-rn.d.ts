// declare module 'jsdom-jscore-rn' {
//   import { JSDOM } from 'jsdom';

//   export default class JSDOM extends JSDOM {
//     constructor(html: string, options?: any);
//     window: any;
//     serialize(): string;
//   }
// }


declare module 'jsdom-jscore-rn' {
  interface JSDOMOptions {
    deferClose?: boolean;
  }

  interface JSDOM {
    level: (level: string, feature: string) => any;
    jsdom: (html: string, level: string | any, options?: JSDOMOptions) => any;
    html: (html: string, level: string | any, options?: JSDOMOptions) => any;
    env: (html: string, level: string | any, callback: (err: any, result: { document: any }) => void) => void;
    browserAugmentation: (level: any, options?: JSDOMOptions) => any;
    version: number;
    dom: any;
    defaultLevel: any;
  }

  const jsdom: JSDOM;

  export default jsdom;
}

