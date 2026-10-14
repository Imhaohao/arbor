import sys
import math

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    N = int(input_data[0])
    
    idx = 1
    delta = []
    prev_Qx, prev_Qy = 0, 0
    for k in range(1, N + 1):
        x = int(input_data[idx])
        y = int(input_data[idx + 1])
        idx += 2
        
        if k % 2 == 1:
            Qx, Qy = -x, -y
        else:
            Qx, Qy = x, y
            
        dx = Qx - prev_Qx
        dy = Qy - prev_Qy
        if dx != 0 or dy != 0:
            delta.append((dx, dy))
        prev_Qx, prev_Qy = Qx, Qy

    # --- Part 1: Maximum Signed Area A_max ---
    if len(delta) <= 1:
        max_A = 0
    else:
        delta_A = sorted(delta, key=lambda v: math.atan2(v[1], v[0]))
        M = len(delta_A)
        S_x = sum(v[0] for v in delta_A)
        S_y = sum(v[1] for v in delta_A)
        
        cur_A = 0
        pref_x = 0
        pref_y = 0
        for vx, vy in delta_A:
            cur_A += pref_x * vy - pref_y * vx
            pref_x += vx
            pref_y += vy
            
        max_A = cur_A
        for i in range(M - 1):
            vx, vy = delta_A[i]
            cur_A += 2 * (S_x * vy - S_y * vx)
            if cur_A > max_A:
                max_A = cur_A

    # --- Part 2: Maximum Squared Reach R_max ---
    if not delta:
        max_R = 0
    else:
        lines = {}
        current_sum_x = 0
        current_sum_y = 0
        total_x = 0
        total_y = 0
        
        for vx, vy in delta:
            total_x += vx
            total_y += vy
            if vy > 0 or (vy == 0 and vx > 0):
                current_sum_x += vx
                current_sum_y += vy
                g = math.gcd(abs(vx), vy)
                key = (vx // g, vy // g)
                if key not in lines:
                    lines[key] = [0, 0, 0, 0]
                lines[key][0] += vx
                lines[key][1] += vy
            else:
                rx, ry = -vx, -vy
                g = math.gcd(abs(rx), ry)
                key = (rx // g, ry // g)
                if key not in lines:
                    lines[key] = [0, 0, 0, 0]
                lines[key][2] += vx
                lines[key][3] += vy
                
        sorted_keys = sorted(lines.keys(), key=lambda k: math.atan2(k[1], k[0]))
        
        max_R = total_x * total_x + total_y * total_y
        
        for key in sorted_keys:
            f_x, f_y, o_x, o_y = lines[key]
            inside_x = current_sum_x - f_x
            inside_y = current_sum_y - f_y
            
            candidates = (
                (inside_x, inside_y),
                (inside_x + f_x, inside_y + f_y),
                (inside_x + o_x, inside_y + o_y),
                (inside_x + f_x + o_x, inside_y + f_y + o_y),
            )
            for sx, sy in candidates:
                norm1 = sx * sx + sy * sy
                comp_x = total_x - sx
                comp_y = total_y - sy
                norm2 = comp_x * comp_x + comp_y * comp_y
                if norm1 > max_R:
                    max_R = norm1
                if norm2 > max_R:
                    max_R = norm2
                    
            current_sum_x = inside_x + o_x
            current_sum_y = inside_y + o_y

    print(f"{max_A} {max_R}")

if __name__ == '__main__':
    main()
