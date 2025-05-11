import { ObsidianMetadataExtractor } from "./obsidianMetadataExtractor.js";

describe("ObsidianMetadataExtractor", () => {
	const mdWithFrontmatter = `---\ntitle: Test Note\ndescription: This is a test.\ntags: tag1, tag2\n---\n# Heading\nContent here. #tag3\nfield1:: value1\n[field2:: value2]\n(field3:: value3)`;

	it("parseFrontMatter extracts YAML frontmatter", () => {
		const fm =
			ObsidianMetadataExtractor.parseFrontMatter(mdWithFrontmatter);
		expect(fm.title).toBe("Test Note");
		expect(fm.description).toBe("This is a test.");
		expect(fm.tags).toEqual(["tag1", "tag2"]);
	});

	it("removeFrontMatter removes YAML frontmatter", () => {
		const removed =
			ObsidianMetadataExtractor.removeFrontMatter(mdWithFrontmatter);
		expect(removed.startsWith("# Heading")).toBe(true);
	});

	it("parseObsidianTags extracts inline tags", () => {
		const tags =
			ObsidianMetadataExtractor.parseObsidianTags(mdWithFrontmatter);
		expect(tags.has("tag3")).toBe(true);
	});

	it("parseDataviewFields extracts dataview fields (line, bracket, paren)", () => {
		const content =
			ObsidianMetadataExtractor.removeFrontMatter(mdWithFrontmatter);
		const fields = ObsidianMetadataExtractor.parseDataviewFields(content);
		expect(fields.field1).toBe("value1");
		expect(fields.field2).toBe("value2");
		expect(fields.field3).toBe("value3");
	});

	it("extractMetadata integrates all Obsidian metadata", () => {
		const metadata =
			ObsidianMetadataExtractor.extractMetadata(mdWithFrontmatter);

		expect(metadata.frontMatter.title).toBe("Test Note");
		expect(metadata.frontMatter.description).toBe("This is a test.");

		expect(metadata.tags).toContain("tag1");
		expect(metadata.tags).toContain("tag2");
		expect(metadata.tags).toContain("tag3");

		expect(metadata.dataviewFields.field1).toBe("value1");
		expect(metadata.dataviewFields.field2).toBe("value2");
		expect(metadata.dataviewFields.field3).toBe("value3");
	});
});
