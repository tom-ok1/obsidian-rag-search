import { beforeEach, describe, expect, it } from "vitest";
import { HashRing } from "./hashring";

describe("HashRing", () => {
	it("should add nodes and increase ring size", () => {
		const ring = new HashRing({ replicas: 10 });
		ring.addNode("node1");
		expect((ring as any).nodes.has("node1")).toBe(true);
		expect((ring as any).ring.length).toBe(10);
		ring.addNode("node2");
		expect((ring as any).nodes.has("node2")).toBe(true);
		expect((ring as any).ring.length).toBe(20);
	});

	it("should not add the same node twice", () => {
		const ring = new HashRing({ replicas: 10 });
		ring.addNode("node1");
		const initialRingSize = (ring as any).ring.length;
		ring.addNode("node1"); // Add again
		expect((ring as any).nodes.size).toBe(1);
		expect((ring as any).ring.length).toBe(initialRingSize);
	});

	it("should remove nodes and decrease ring size", () => {
		const ring = new HashRing({ replicas: 10 });
		ring.addNode("node1");
		ring.addNode("node2");
		expect((ring as any).ring.length).toBe(20);
		ring.removeNode("node1");
		expect((ring as any).nodes.has("node1")).toBe(false);
		expect((ring as any).ring.length).toBe(10);
		expect((ring as any).ring.every((vn: any) => vn.node === "node2")).toBe(
			true
		);
	});

	it("should not fail when removing a non-existent node", () => {
		const ring = new HashRing({ replicas: 10 });
		ring.addNode("node1");
		const initialRingSize = (ring as any).ring.length;
		expect(() => ring.removeNode("node2")).not.toThrow();
		expect(ring.replicasCount).toBe(initialRingSize);
	});

	it("should throw error when getting node from empty ring", () => {
		const ring = new HashRing();
		expect(() => ring.getNode("key1")).toThrow("Hash ring is empty");
	});

	it("should consistently get the same node for the same key", () => {
		const ring = new HashRing();
		ring.addNode("node1");
		ring.addNode("node2");
		ring.addNode("node3");

		const key = "my-test-key";
		const node1 = ring.getNode(key);
		const node2 = ring.getNode(key);
		expect(node1).toBe(node2);
	});

	it("should distribute keys across nodes", () => {
		const ring = new HashRing();
		ring.addNode("node1");
		ring.addNode("node2");
		ring.addNode("node3");

		const assignments: Record<string, number> = {
			node1: 0,
			node2: 0,
			node3: 0,
		};
		for (let i = 0; i < 100; i++) {
			const key = `key-${i}`;
			const node = ring.getNode(key);
			assignments[node]++;
		}

		// Check if all nodes received some keys (basic distribution check)
		expect(assignments["node1"]).toBeGreaterThan(0);
		expect(assignments["node2"]).toBeGreaterThan(0);
		expect(assignments["node3"]).toBeGreaterThan(0);
	});

	it("should handle node addition and removal correctly for getNode", () => {
		const ring = new HashRing();
		ring.addNode("node1");
		ring.addNode("node2");

		ring.getNode("key1");
		ring.getNode("key2");

		// Add a new node
		ring.addNode("node3");
		const key1NodeAfterAdd = ring.getNode("key1");
		const key2NodeAfterAdd = ring.getNode("key2");
		// Keys might or might not remap, just check consistency
		expect(typeof key1NodeAfterAdd).toBe("string");
		expect(typeof key2NodeAfterAdd).toBe("string");

		// Remove a node
		ring.removeNode("node2");
		const key1NodeAfterRemove = ring.getNode("key1");
		const key2NodeAfterRemove = ring.getNode("key2");
		// Check that the removed node is no longer assigned
		expect(key1NodeAfterRemove).not.toBe("node2");
		expect(key2NodeAfterRemove).not.toBe("node2");
		expect(["node1", "node3"]).toContain(key1NodeAfterRemove);
		expect(["node1", "node3"]).toContain(key2NodeAfterRemove);
	});

	describe("diffMovedIds", () => {
		let oldRing: HashRing<string>;
		const allIds = Array.from({ length: 100 }, (_, i) => `id_${i}`);

		beforeEach(() => {
			oldRing = new HashRing<string>();
			oldRing.addNode("0");
			oldRing.addNode("1");
			oldRing.addNode("2");
		});

		it("should return empty array if number of shards is the same and nodes are identical", () => {
			// Create a new ring with the exact same nodes
			const newRing = new HashRing<string>();
			newRing.addNode("0");
			newRing.addNode("1");
			newRing.addNode("2");

			const moved = oldRing.diffMovedIds(3, allIds);

			// Verify against the explicitly created new ring for clarity
			let trulyMovedCount = 0;
			allIds.forEach((id) => {
				if (oldRing.getNode(id) !== newRing.getNode(id)) {
					trulyMovedCount++;
				}
			});

			// Since the node names ("0", "1", "2") and default replicas are the same,
			// the internal diffMovedIds should ideally find no differences.
			expect(moved.length).toBe(0);
			expect(trulyMovedCount).toBe(0); // Double-check logic
		});

		it("should identify moved IDs when increasing shards", () => {
			const moved = oldRing.diffMovedIds(5, allIds); // From 3 to 5 shards
			expect(moved.length).toBeGreaterThan(0);
			moved.forEach((m) => {
				expect(["0", "1", "2"]).toContain(m.from);
				expect(["0", "1", "2", "3", "4"]).toContain(m.to);
				expect(m.from).not.toBe(m.to); // Ensure they actually moved
			});
			// Check that some IDs *didn't* move
			expect(moved.length).toBeLessThan(allIds.length);
		});

		it("should identify moved IDs when decreasing shards", () => {
			const moved = oldRing.diffMovedIds(2, allIds); // From 3 to 2 shards
			expect(moved.length).toBeGreaterThan(0);
			let movedFromRemovedNode = 0;
			moved.forEach((m) => {
				expect(["0", "1", "2"]).toContain(m.from);
				expect(["0", "1"]).toContain(m.to);
				expect(m.from).not.toBe(m.to); // Ensure they actually moved
				if (m.from === "2") {
					movedFromRemovedNode++;
				}
			});
			// All IDs previously on node "2" must have moved
			const countOnNode2 = allIds.filter(
				(id) => oldRing.getNode(id) === "2"
			).length;
			expect(movedFromRemovedNode).toBe(countOnNode2);
			// Check that some IDs *didn't* move (those originally on 0 or 1 that stayed there)
			expect(moved.length).toBeLessThan(allIds.length);
		});
	});

	describe("fnv1a", () => {
		it("should produce consistent hash for the same string", () => {
			const hash1 = HashRing.fnv1a("test-string");
			const hash2 = HashRing.fnv1a("test-string");
			expect(hash1).toBe(hash2);
			expect(typeof hash1).toBe("number");
		});

		it("should produce different hashes for different strings", () => {
			const hash1 = HashRing.fnv1a("test-string-1");
			const hash2 = HashRing.fnv1a("test-string-2");
			expect(hash1).not.toBe(hash2);
		});
	});
});
