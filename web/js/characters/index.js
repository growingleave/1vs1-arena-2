// 캐릭터 목록. 새 캐릭터를 옮기면 여기에 추가한다.
const CHARACTER_REGISTRY = [
    SWORDMAN_CHARACTER_DATA,
    MAGE_CHARACTER_DATA,
];

function getCharacterData(index) {
    return CHARACTER_REGISTRY[index] || CHARACTER_REGISTRY[0];
}
