import sys


def main():
    a, increment, modulus, x, games = map(int, sys.stdin.buffer.read().split())

    lowest = [6] * 64
    highest = [-1] * 64
    for mask in range(1, 64):
        lowest[mask] = (mask & -mask).bit_length() - 1
        highest[mask] = mask.bit_length() - 1

    rank_bit = [1 << rank for rank in range(6)]
    above = [63 ^ ((1 << (rank + 1)) - 1) for rank in range(6)]
    card_suit = [card // 6 for card in range(24)]
    card_bit = [1 << (card % 6) for card in range(24)]
    nontrumps = [
        tuple(suit for suit in range(4) if suit != trump)
        for trump in range(4)
    ]

    seen = [-1] * (4 * modulus)
    totals = [0] * 5
    history = [(0, 0, 0, 0, 0, x)]
    game = 0

    while game < games:
        phase = game & 3
        state = (x << 2) | phase
        start = seen[state]

        if start != -1:
            cycle_length = game - start
            repeats, remainder = divmod(games - start, cycle_length)
            base = history[start]
            tail = history[start + remainder]
            answer = [
                tail[i] + repeats * (totals[i] - base[i])
                for i in range(5)
            ]
            answer.append(tail[5])
            print(*answer)
            return

        seen[state] = game

        deck = list(range(24))
        for i in range(23, 0, -1):
            x = (a * x + increment) % modulus
            j = x % (i + 1)
            deck[i], deck[j] = deck[j], deck[i]

        trump = card_suit[deck[23]]
        other_suits = nontrumps[trump]
        hands = [[0, 0, 0, 0] for _ in range(4)]

        for seat in range(4):
            hand = hands[seat]
            offset = seat * 6
            for pos in range(offset, offset + 6):
                card = deck[pos]
                hand[card_suit[card]] |= card_bit[card]

        tricks = [0, 0, 0, 0]
        leader = phase

        for _ in range(6):
            hand = hands[leader]
            played_suit = trump
            played_rank = -1

            for suit in other_suits:
                rank = highest[hand[suit]]
                if rank > played_rank:
                    played_suit = suit
                    played_rank = rank

            if played_rank == -1:
                played_rank = lowest[hand[trump]]

            hand[played_suit] ^= rank_bit[played_rank]
            led = played_suit
            best_suit = played_suit
            best_rank = played_rank
            winner = leader

            for step in range(1, 4):
                seat = (leader + step) & 3
                hand = hands[seat]
                mask = hand[led]

                if mask:
                    played_suit = led
                    if best_suit == led:
                        winning = mask & above[best_rank]
                        if winning:
                            mask = winning
                    played_rank = lowest[mask]
                else:
                    winning = hand[trump]
                    if best_suit == trump:
                        winning &= above[best_rank]

                    if winning:
                        played_suit = trump
                        played_rank = lowest[winning]
                    else:
                        played_suit = trump
                        played_rank = 6

                        for suit in other_suits:
                            rank = lowest[hand[suit]]
                            if rank < played_rank:
                                played_suit = suit
                                played_rank = rank

                        if played_rank == 6:
                            played_rank = lowest[hand[trump]]

                hand[played_suit] ^= rank_bit[played_rank]

                if (
                    played_suit == best_suit and played_rank > best_rank
                ) or (
                    played_suit == trump and best_suit != trump
                ):
                    best_suit = played_suit
                    best_rank = played_rank
                    winner = seat

            tricks[winner] += 1
            leader = winner

        if tricks[leader] == 6:
            totals[leader] += 20
            totals[4] += 1
        else:
            for seat in range(4):
                count = tricks[seat]
                totals[seat] += count - (2 if count == 0 else 0)
            totals[leader] += 2

        history.append((
            totals[0], totals[1], totals[2], totals[3], totals[4], x
        ))
        game += 1

    print(*totals, x)


if __name__ == "__main__":
    main()
