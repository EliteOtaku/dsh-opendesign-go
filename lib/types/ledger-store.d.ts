import type { LedgerEntry } from './usage-ledger.ts';
/**
 * Owns the ledger file for one plugin mount.
 */
export declare class LedgerStore {
    #private;
    /**
     * @param path - absolute path of the JSONL ledger.
     */
    constructor(path: string);
    /**
     * Resolve the ledger path inside a DSH home.
     * @param dshHome - resolved DSH home directory.
     * @returns the ledger path for this plugin.
     */
    static pathIn(dshHome: string): string;
    /**
     * Record one finished call and persist it.
     * @param entry - the call to append.
     */
    record(entry: LedgerEntry): void;
    /**
     * Every retained entry.
     * @returns the entries, oldest first.
     */
    all(): readonly LedgerEntry[];
}
