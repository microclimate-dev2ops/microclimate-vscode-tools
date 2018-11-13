
import * as i18next from "i18next";
import * as i18nextBackend from "i18next-node-fs-backend";
import * as path from "path";

import Log from "../../Logger";

export default class Translator {

    private static _t: i18next.TranslationFunction;

    /**
     * Must explicitly call init before calling this
     */
    public static t(key: string, options?: i18next.TranslationOptions): string {
        if (this._t == null) {
            // init has not been called, or there was an init error
            Log.e("i18next was not initialized, returning key");
            return key;
        }

        // _t returns 'any', but seems to always be string. Handle that here so that caller can assume it's a string.
        const tResult = this._t(key, options);
        if (typeof tResult === typeof "") {
            if (tResult === key) {
                Log.e(`Did not find string with key: ${key}`);
            }
            return <string>tResult;
        }
        else {
            // Don't think this will ever happen
            Log.e(`Unexpected result from translation function, type is ${typeof tResult}, result is:`, tResult);
            return key;
        }
    }

    /**
     * Must call this before calling t
     */
    public static init(): Promise<i18next.TranslationFunction> {
        return new Promise<i18next.TranslationFunction>( (resolve, reject) => {
            i18next
                .use(i18nextBackend)        // required so we can load strings from filesystem
                .init({
                    // only support english
                    lng: "en",
                    fallbackLng: "en",
                    // debug: true,
                    saveMissing: true,
                    backend: {
                        loadPath: path.join(__dirname, "strings-{{lng}}.json")
                    }
                }, (err: any, translationFn: i18next.TranslationFunction) => {
                    if (err) {
                        return reject(err);
                    }
                    else {
                        Log.i("i18next initialized");
                        this._t = translationFn;
                        return resolve(translationFn);
                    }
                });
        });
    }
}




