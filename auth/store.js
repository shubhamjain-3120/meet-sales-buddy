export function createStore(db) {
  const statement = (sql, ...values) => db.prepare(sql).bind(...values);
  return {
    room: () => statement("SELECT * FROM rooms WHERE singleton = 1").first(),
    member: id => statement("SELECT * FROM members WHERE id = ?", id).first(),
    legacyMember: hash => statement("SELECT * FROM members WHERE legacy_hash = ?", hash).first(),
    async bootstrap(room, owner, legacyHash = null) {
      await db.batch([
        statement("INSERT OR IGNORE INTO rooms (singleton, id, owner_id, created_at) VALUES (1, ?, ?, ?)", room, owner.id, owner.created_at),
        statement("INSERT OR IGNORE INTO members (id, room_id, name, role, created_at, legacy_hash) SELECT ?, id, ?, 'owner', ?, ? FROM rooms WHERE owner_id = ?", owner.id, owner.name, owner.created_at, legacyHash, owner.id)
      ]);
      const saved = await this.room();
      return this.member(saved.owner_id);
    },
    async adoptMember(member, hash) {
      await statement("INSERT OR IGNORE INTO members (id, room_id, name, role, created_at, legacy_hash) VALUES (?, ?, ?, 'member', ?, ?)", member.id, member.room_id, member.name, member.created_at, hash).run();
      return this.legacyMember(hash);
    },
    async createInvite(invite) {
      await statement("INSERT INTO invites (id, room_id, code_hash, created_at) VALUES (?, ?, ?, ?)", invite.id, invite.room_id, invite.code_hash, invite.created_at).run();
    },
    async redeem(codeHash, member) {
      // Both statements commit together. A competing redemption sees used_by set.
      const results = await db.batch([
        statement("INSERT INTO members (id, room_id, name, role, created_at) SELECT ?, room_id, ?, 'member', ? FROM invites WHERE code_hash = ? AND revoked_at IS NULL AND used_by IS NULL", member.id, member.name, member.created_at, codeHash),
        statement("UPDATE invites SET used_by = ? WHERE code_hash = ? AND used_by IS NULL AND EXISTS (SELECT 1 FROM members WHERE id = ?)", member.id, codeHash, member.id)
      ]);
      return results[0].meta.changes === 1 ? this.member(member.id) : null;
    },
    async dashboard(room) {
      const [members, invites] = await db.batch([
        statement("SELECT id, name, role, revoked_at, removal_pending FROM members WHERE room_id = ? ORDER BY created_at, id", room),
        statement("SELECT id, created_at, revoked_at, used_by FROM invites WHERE room_id = ? ORDER BY created_at DESC, id", room)
      ]);
      return { members: members.results, invites: invites.results };
    },
    async revokeInvite(room, id, time) {
      const result = await statement("UPDATE invites SET revoked_at = COALESCE(revoked_at, ?) WHERE room_id = ? AND id = ? AND used_by IS NULL", time, room, id).run();
      return result.meta.changes > 0;
    },
    async removeMember(room, id, time) {
      const result = await statement("UPDATE members SET revoked_at = COALESCE(revoked_at, ?), removal_pending = 1 WHERE room_id = ? AND id = ? AND role != 'owner'", time, room, id).run();
      return result.meta.changes > 0;
    },
    finishRemoval: id => statement("UPDATE members SET removal_pending = 0 WHERE id = ?", id).run()
  };
}
