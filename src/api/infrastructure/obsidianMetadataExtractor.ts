import yaml from "js-yaml";

export type ObsidianMetadata = {
	frontMatter: Record<string, any>;
	tags: string[];
	dataviewFields: Record<string, string>;
};

export class ObsidianMetadataExtractor {
	static FRONT_MATTER_REGEX = /^---\n([\s\S]*?)\n---\n?/;
	static TAG_REGEX = /(?:\s|^)#([a-zA-Z_][\w/-]*)/g;
	static DATAVIEW_LINE_REGEX = /^\s*(\w+)::\s*(.*)$/gm;
	static DATAVIEW_INLINE_BRACKET_REGEX = /\[(\w+)::\s*(.*?)\]/gm;
	static DATAVIEW_INLINE_PAREN_REGEX = /\((\w+)::\s*(.*?)\)/gm;

	static parseFrontMatter(content: string): Record<string, any> {
		const match = content.match(this.FRONT_MATTER_REGEX);
		if (!match) return {};
		try {
			const frontMatter = yaml.load(match[1]) as Record<string, any>;
			if (frontMatter && typeof frontMatter.tags === "string") {
				frontMatter.tags = frontMatter.tags
					.split(/[\,\s]+/)
					.filter(Boolean);
			}
			return frontMatter || {};
		} catch {
			return {};
		}
	}

	static removeFrontMatter(content: string): string {
		return content.replace(this.FRONT_MATTER_REGEX, "");
	}

	static parseObsidianTags(content: string): Set<string> {
		const matches = content.matchAll(this.TAG_REGEX);
		const tags = new Set<string>();
		for (const match of matches) {
			tags.add(match[1]);
		}
		return tags;
	}

	static parseDataviewFields(content: string): Record<string, string> {
		const fields: Record<string, string> = {};
		for (const [, key, value] of content.matchAll(
			this.DATAVIEW_LINE_REGEX
		)) {
			fields[key] = value;
		}
		for (const [, key, value] of content.matchAll(
			this.DATAVIEW_INLINE_BRACKET_REGEX
		)) {
			fields[key] = value;
		}
		for (const [, key, value] of content.matchAll(
			this.DATAVIEW_INLINE_PAREN_REGEX
		)) {
			fields[key] = value;
		}
		return fields;
	}

	/**
	 * Extract Obsidian-specific metadata (frontmatter, tags, dataview fields)
	 * without file system related metadata
	 */
	static extractMetadata(content: string): ObsidianMetadata {
		const frontMatter = this.parseFrontMatter(content);
		const contentWithoutFrontMatter = this.removeFrontMatter(content);
		const dataviewFields = this.parseDataviewFields(
			contentWithoutFrontMatter
		);
		const tags = new Set([
			...(frontMatter.tags ?? []),
			...this.parseObsidianTags(contentWithoutFrontMatter),
		]);

		return {
			frontMatter,
			tags: Array.from(tags),
			dataviewFields,
		};
	}
}
