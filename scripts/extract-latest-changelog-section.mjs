import * as process from "node:process";
import * as readline from "node:readline";
import * as fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";

const REGEX_CHANGELOG_RELEASE_SECTION_HEADING = /^## \[(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)\] - (\d{4}-\d{2}-\d{2})$/;

async function fileExists(path) {
    return fs.stat(path).then(s => s.isFile(), () => false);
}

async function main() {
    const changelogPath = process.env.CHANGELOG_PATH;
    if (!changelogPath) {
        throw new Error(`invalid path to changelog [${changelogPath}]`);
    }
    const changelogPathExists = await fileExists(changelogPath);
    if (!changelogPathExists) {
        throw new Error(`missing changelog file @ [${changelogPath}]`);
    }

    const outputPath = process.env.OUTPUT_PATH;
    if (!outputPath) {
        throw new Error(`invalid output path [${outputPath}]`);
    }
    process.stderr.write(`[info] reading lines from changelog @ [${changelogPath}]\n`);
    const lines = readline.createInterface({
        input: createReadStream(changelogPath),
        crlfDelay: Infinity,
    });

    // Read the first line
    let linesIterator = lines[Symbol.asyncIterator]();
    let { value: firstLine, done } = await linesIterator.next();
    if (!firstLine || done) { throw new Error("missing first line/unexpectedly finished iterator (is the changelog file correct?)"); }
    if (!firstLine.toLowerCase().includes("changelog")) {
        throw new Error("missing changelog heading on first line, is this file a changelog file?");
    }

    let outputStream;
    let sectionsFound = 0;
    for await (const line of lines) {
        if (REGEX_CHANGELOG_RELEASE_SECTION_HEADING.test(line)) {
            sectionsFound++;
            if (!outputStream) {
                outputStream = createWriteStream(outputPath);
            }
        }
        if (sectionsFound == 0) {
            continue;
        } else if (sectionsFound === 1) {
            //process.stderr.write(`[info] writing line [${line}]\n`);
            outputStream.write(`${line}\n`);
        } else if (sectionsFound === 2) {
            outputStream.close();
            process.stderr.write(`[info] wrote lines to output @ [${outputPath}]\n`);
            break;
        } else {
            throw new Error("unexpectedly processing more than one section");
        }
    }
}

await main();
