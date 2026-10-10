import sys


def main():
    data = list(map(int, sys.stdin.buffer.read().split()))
    limit = data[0]
    board = data[1:7] + [0] + data[7:13] + [0]

    sides = (tuple(range(6)), tuple(range(7, 13)))
    pits = sides[0] + sides[1]
    sequences = [None] * 14
    metadata = [None] * 14

    for player in range(2):
        own_store = 6 if player == 0 else 13
        skipped_store = 13 if player == 0 else 6

        for source in sides[player]:
            sequence = []
            position = source
            for _ in range(13):
                position = (position + 1) % 14
                if position == skipped_store:
                    position = (position + 1) % 14
                sequence.append(position)

            sequences[source] = sequence
            distances = [0] * 14
            for distance, position in enumerate(sequence, 1):
                distances[position] = distance

            entries = []
            for remainder in range(13):
                last = sequence[remainder - 1] if remainder else source
                extra = last == own_store
                store_hit = int(distances[own_store] <= remainder)

                if last in sides[player]:
                    opposite = 12 - last
                    opposite_hit = int(distances[opposite] <= remainder)
                else:
                    opposite = -1
                    opposite_hit = 0

                entries.append(
                    (last, opposite, extra, store_hit, opposite_hit)
                )
            metadata[source] = entries

    player = 0
    moves = 0
    south = sum(board[:6])
    north = sum(board[7:13])

    while moves < limit and south and north:
        best_key = (-1, False, 0)

        for source in sides[player]:
            seeds = board[source]
            if not seeds:
                continue

            quotient, remainder = divmod(seeds, 13)
            last, opposite, extra, store_hit, opposite_hit = (
                metadata[source][remainder]
            )

            gain = quotient + store_hit
            capture = 0

            if opposite >= 0:
                can_capture = (
                    (remainder == 0 and quotient == 1)
                    or (
                        remainder != 0
                        and quotient == 0
                        and board[last] == 0
                    )
                )
                if can_capture:
                    opposite_seeds = (
                        board[opposite] + quotient + opposite_hit
                    )
                    if opposite_seeds:
                        capture = opposite_seeds + 1
                        gain += capture

            # Sources are visited in increasing order, so exact ties
            # automatically retain the smaller source position.
            key = (gain, extra, seeds)
            if key > best_key:
                best_key = key
                best_source = source
                best_quotient = quotient
                best_remainder = remainder
                best_last = last
                best_opposite = opposite
                best_extra = extra
                best_capture = capture

        board[best_source] = 0
        sequence = sequences[best_source]

        if best_quotient:
            for position in sequence:
                board[position] += best_quotient

        for index in range(best_remainder):
            board[sequence[index]] += 1

        if best_capture:
            own_store = 6 if player == 0 else 13
            board[own_store] += best_capture
            board[best_last] = 0
            board[best_opposite] = 0

        moves += 1
        south = sum(board[:6])
        north = sum(board[7:13])

        if not best_extra:
            player ^= 1

    if not south or not north:
        status = "END"
        board[6] += south
        board[13] += north
        for position in pits:
            board[position] = 0
    else:
        status = "CAP"

    print(status, moves, board[6], board[13])
    print(*(board[position] for position in pits))


if __name__ == "__main__":
    main()
