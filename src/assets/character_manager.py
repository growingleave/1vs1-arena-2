from abilities.swordman import SWORDMAN_CHARACTER_DATA
from abilities.mage import MAGE_CHARACTER_DATA
from abilities.fighter import FIGHTER_CHARACTER_DATA
from abilities.accelerator import ACCELERATOR_CHARACTER_DATA
from abilities.demolitionist import DEMOLITIONIST_CHARACTER_DATA
from abilities.hacker import HACKER_CHARACTER_DATA
from abilities.assassin import ASSASSIN_CHARACTER_DATA
from abilities.grinder import GRINDER_CHARACTER_DATA
from abilities.dio import DIO_CHARACTER_DATA
from abilities.sans import SANS_CHARACTER_DATA
from abilities.archer import ARCHER_CHARACTER_DATA

CHARACTER_REGISTRY = [
    SWORDMAN_CHARACTER_DATA,
    MAGE_CHARACTER_DATA,
    FIGHTER_CHARACTER_DATA,
    ACCELERATOR_CHARACTER_DATA,
    DEMOLITIONIST_CHARACTER_DATA,
    HACKER_CHARACTER_DATA,
    ASSASSIN_CHARACTER_DATA,
    GRINDER_CHARACTER_DATA,
    DIO_CHARACTER_DATA,
    SANS_CHARACTER_DATA,
    ARCHER_CHARACTER_DATA,
]

def get_character_data(index):
    if 0 <= index < len(CHARACTER_REGISTRY):
        return CHARACTER_REGISTRY[index]
    return CHARACTER_REGISTRY[0]