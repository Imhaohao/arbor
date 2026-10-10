import sys

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    M = int(input_data[0])
    board = [0] * 14
    for i in range(6):
        board[i] = int(input_data[1 + i])
    board[6] = 0
    for i in range(6):
        board[7 + i] = int(input_data[7 + i])
    board[13] = 0

    # Initial check before the first move
    p0_empty = (board[0] == 0 and board[1] == 0 and board[2] == 0 and 
                board[3] == 0 and board[4] == 0 and board[5] == 0)
    p1_empty = (board[7] == 0 and board[8] == 0 and board[9] == 0 and 
                board[10] == 0 and board[11] == 0 and board[12] == 0)

    if p0_empty or p1_empty:
        for i in range(6):
            board[6] += board[i]
            board[i] = 0
        for i in range(7, 13):
            board[13] += board[i]
            board[i] = 0
        print(f"END 0 {board[6]} {board[13]}")
        print(f"{board[0]} {board[1]} {board[2]} {board[3]} {board[4]} {board[5]} "
              f"{board[7]} {board[8]} {board[9]} {board[10]} {board[11]} {board[12]}")
        return

    moves_made = 0
    p = 0
    status = "CAP"

    while moves_made < M:
        offset = 0 if p == 0 else 7
        my_store = 6 if p == 0 else 13
        opp_store = 13 if p == 0 else 6

        best_s = -1
        best_orig_s = -1
        best_gain = -1
        best_extra = -1
        best_n = -1
        best_capture = False

        for s in range(6):
            orig_s = s + offset
            n = board[orig_s]
            if n == 0:
                continue

            full = n // 13
            rem = n % 13

            sown_to_store = full + (1 if rem >= 6 - s else 0)
            last = s + rem if s + rem < 13 else s + rem - 13
            extra = 1 if rem == 6 - s else 0
            gain = sown_to_store
            capture = False

            if not extra and last <= 5:
                is_one = (full == 1) if rem == 0 else (full == 0 and board[last + offset] == 0)
                if is_one:
                    opp = 12 - last
                    orig_opp = opp if offset == 0 else opp - 7
                    seeds_opp = board[orig_opp] + full + (1 if opp - s <= rem else 0)
                    if seeds_opp > 0:
                        capture = True
                        gain += seeds_opp + 1

            if (gain > best_gain or
                (gain == best_gain and extra > best_extra) or
                (gain == best_gain and extra == best_extra and n > best_n)):
                best_s = s
                best_orig_s = orig_s
                best_gain = gain
                best_extra = extra
                best_n = n
                best_capture = capture

        # Execute the chosen move
        board[best_orig_s] = 0
        full = best_n // 13
        rem = best_n % 13

        if full:
            for i in range(14):
                if i != opp_store:
                    board[i] += full

        if rem:
            for step in range(1, rem + 1):
                pos = best_s + step
                if pos >= 13:
                    pos -= 13
                orig_pos = pos if offset == 0 else (pos + 7 if pos < 7 else pos - 7)
                board[orig_pos] += 1

        if best_capture:
            last = best_s + rem if best_s + rem < 13 else best_s + rem - 13
            orig_last = last + offset
            opp = 12 - last
            orig_opp = opp if offset == 0 else opp - 7
            board[my_store] += board[orig_opp] + board[orig_last]
            board[orig_opp] = 0
            board[orig_last] = 0

        moves_made += 1

        # Check end of game
        p0_empty = (board[0] == 0 and board[1] == 0 and board[2] == 0 and 
                    board[3] == 0 and board[4] == 0 and board[5] == 0)
        p1_empty = (board[7] == 0 and board[8] == 0 and board[9] == 0 and 
                    board[10] == 0 and board[11] == 0 and board[12] == 0)

        if p0_empty or p1_empty:
            for i in range(6):
                board[6] += board[i]
                board[i] = 0
            for i in range(7, 13):
                board[13] += board[i]
                board[i] = 0
            status = "END"
            break

        if not best_extra:
            p = 1 - p

    print(f"{status} {moves_made} {board[6]} {board[13]}")
    print(f"{board[0]} {board[1]} {board[2]} {board[3]} {board[4]} {board[5]} "
          f"{board[7]} {board[8]} {board[9]} {board[10]} {board[11]} {board[12]}")

if __name__ == '__main__':
    main()
