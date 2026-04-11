#!/usr/bin/env python3
"""
Enhanced ASCII Fractal Tree Generator with Color
Generates a beautiful recursive fractal tree with ANSI color support
"""

import math
import sys

class ColoredFractalTree:
    # ANSI color codes
    BROWN = '\033[38;5;94m'   # Trunk/branches
    GREEN = '\033[38;5;34m'   # Leaves
    LIGHT_GREEN = '\033[38;5;46m'  # Light leaves
    RESET = '\033[0m'
    BOLD = '\033[1m'
    
    def __init__(self, width=100, height=40):
        self.width = width
        self.height = height
        self.canvas = [[' ' for _ in range(width)] for _ in range(height)]
        self.colors = [['' for _ in range(width)] for _ in range(height)]
    
    def draw_line(self, x1, y1, x2, y2, char='*', color=''):
        """Draw a line on the canvas using Bresenham's algorithm"""
        x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
        
        dx = abs(x2 - x1)
        dy = abs(y2 - y1)
        sx = 1 if x1 < x2 else -1
        sy = 1 if y1 < y2 else -1
        err = dx - dy
        
        while True:
            if 0 <= y1 < self.height and 0 <= x1 < self.width:
                self.canvas[y1][x1] = char
                self.colors[y1][x1] = color
            
            if x1 == x2 and y1 == y2:
                break
            
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x1 += sx
            if e2 < dx:
                err += dx
                y1 += sy
    
    def draw_branch(self, x, y, length, angle, depth, max_depth):
        """Recursively draw tree branches"""
        if depth > max_depth or length < 0.5:
            return
        
        # Calculate end point of branch
        x2 = x + length * math.cos(math.radians(angle))
        y2 = y - length * math.sin(math.radians(angle))
        
        # Choose character and color based on depth
        if depth == 0:
            char = '█'
            color = self.BOLD + self.BROWN
        elif depth == 1:
            char = '║'
            color = self.BROWN
        elif depth == 2:
            char = '│'
            color = self.BROWN
        elif depth < max_depth - 1:
            char = '|'
            color = self.BROWN
        else:
            # Leaves - alternate colors for variety
            char = '*' if depth % 2 == 0 else '•'
            color = self.GREEN if depth % 3 == 0 else self.LIGHT_GREEN
        
        # Draw the branch
        self.draw_line(x, y, x2, y2, char, color)
        
        # Recursively draw sub-branches with slight variation
        new_length = length * 0.7
        angle_spread = 28
        
        # Left branch
        self.draw_branch(x2, y2, new_length, angle + angle_spread, depth + 1, max_depth)
        
        # Right branch
        self.draw_branch(x2, y2, new_length, angle - angle_spread, depth + 1, max_depth)
        
        # Optional middle branch for bushier tree (only at certain depths)
        if depth < 3 and depth % 2 == 0:
            self.draw_branch(x2, y2, new_length * 0.8, angle, depth + 1, max_depth)
    
    def render(self, use_color=True):
        """Return the canvas as a string"""
        lines = []
        for y in range(self.height):
            line = ''
            for x in range(self.width):
                if use_color and self.colors[y][x]:
                    line += self.colors[y][x] + self.canvas[y][x] + self.RESET
                else:
                    line += self.canvas[y][x]
            lines.append(line)
        return '\n'.join(lines)

def main():
    use_color = sys.stdout.isatty()  # Only use color if outputting to terminal
    
    print("="*100)
    print(" " * 30 + "ENHANCED ASCII FRACTAL TREE")
    print("="*100)
    print()
    
    # Create larger, more detailed tree
    tree = ColoredFractalTree(width=100, height=42)
    
    # Start from bottom center
    start_x = tree.width // 2
    start_y = tree.height - 1
    initial_length = 14
    initial_angle = 90
    max_depth = 7
    
    print("Configuration:")
    print(f"  Canvas Size: {tree.width}x{tree.height}")
    print(f"  Starting Position: ({start_x}, {start_y})")
    print(f"  Initial Branch Length: {initial_length}")
    print(f"  Maximum Recursion Depth: {max_depth}")
    print(f"  Branch Angle Spread: 28°")
    print(f"  Length Reduction Factor: 0.70")
    print(f"  Color Support: {'Enabled' if use_color else 'Disabled'}")
    print()
    print("="*100)
    print()
    
    # Draw the tree
    tree.draw_branch(start_x, start_y, initial_length, initial_angle, 0, max_depth)
    
    # Render and display
    output = tree.render(use_color=use_color)
    print(output)
    
    print()
    print("="*100)
    print()
    
    # Statistics
    total_chars = sum(1 for row in tree.canvas for char in row if char != ' ')
    print("Statistics:")
    print(f"  Total characters drawn: {total_chars}")
    print(f"  Canvas utilization: {(total_chars / (tree.width * tree.height)) * 100:.1f}%")
    print(f"  Theoretical max branches: {2**(max_depth+1) - 1}")
    print()
    
    if use_color:
        print("Visual Legend:")
        print(f"  {tree.BOLD}{tree.BROWN}█{tree.RESET} = Trunk (depth 0)")
        print(f"  {tree.BROWN}║│|{tree.RESET} = Branches (depth 1-4)")
        print(f"  {tree.GREEN}*{tree.RESET} {tree.LIGHT_GREEN}•{tree.RESET} = Leaves (depth 5-7)")
    else:
        print("Visual Legend:")
        print("  █ = Trunk (depth 0)")
        print("  ║│| = Branches (depth 1-4)")
        print("  *• = Leaves (depth 5-7)")
    print()
    print("="*100)

if __name__ == "__main__":
    main()
