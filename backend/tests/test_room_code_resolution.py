import pytest
from app.game.code_utils import generate_unambiguous_code, get_code_candidates
from app.game.room_manager import room_manager
from app.api.rooms import find_room_by_code
from app.models.room import Room, RoomStatus
from app.database import AsyncSessionLocal


def test_generate_unambiguous_code():
    for _ in range(100):
        code = generate_unambiguous_code(6)
        assert len(code) == 6
        assert "0" not in code
        assert "O" not in code
        assert "1" not in code
        assert "I" not in code


def test_get_code_candidates_visual_ambiguity():
    # 1 -> I, L
    candidates_1 = get_code_candidates("143V96")
    assert "143V96" in candidates_1
    assert "I43V96" in candidates_1
    assert "L43V96" in candidates_1

    # I -> 1, L
    candidates_i = get_code_candidates("I43V96")
    assert "I43V96" in candidates_i
    assert "143V96" in candidates_i

    # 0 -> O
    candidates_0 = get_code_candidates("AB0CD")
    assert "AB0CD" in candidates_0
    assert "ABOCD" in candidates_0


@pytest.mark.asyncio
async def test_find_room_across_layers(setup_db):
    async with AsyncSessionLocal() as session:
        # Create a test room in DB
        r = Room(code="I43V96", host_id="test_host", max_players=8, allow_bots=True)
        session.add(r)
        await session.commit()

        # Find using visual ambiguity: input 143V96 should resolve to I43V96
        found = await find_room_by_code("143V96", session)
        assert found is not None
        assert found.code == "I43V96"

        # Find in memory only
        room_manager.create_room(host_sid="sid_host", max_players=8, room_code="MEM999")
        found_mem = await find_room_by_code("MEM999", session)
        assert found_mem is not None
        assert found_mem.code == "MEM999"

        # Find in memory using visual ambiguity
        room_manager.create_room(host_sid="sid_host2", max_players=8, room_code="B52XYZ")
        found_amb_mem = await find_room_by_code("8S2XYZ", session)
        assert found_amb_mem is not None
        assert found_amb_mem.code == "B52XYZ"
