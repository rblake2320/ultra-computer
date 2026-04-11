#!/usr/bin/env python3
"""
ASCII Fractal Tree Generator
Generates a beautiful recursive fractal tree using ASCII characters
"""

import math

class FractalTree:
    def __init__(self, width=80, height=30):
        self.width = width
        self.height = height
        self.canvas = [[' ' for _ in range(width)] for _ in range(height)]
    
    def draw_line(self, x1, y1, x2, y2, char='*'):
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
        if depth > max_depth or length < 1:
            return
        
        # Calculate end point of branch
        x2 = x + length * math.cos(math.radians(angle))
        y2 = y - length * math.sin(math.radians(angle))  # Negative because y increases downward
        
        # Choose character based on depth (trunk is thicker)
        if depth == 0:
            char = '█'
        elif depth == 1:
            char = '║'
        elif depth == 2:
            char = '│'
        elif depth < max_depth - 1:
            char = '|'
        else:
            char = '*'  # Leaves
        
        # Draw the branch
        self.draw_line(x, y, x2, y2, char)
        
        # Recursively draw sub-branches
        new_length = length * 0.67  # Branch length reduction factor
        angle_spread = 25  # Angle between branches
        
        # Left branch
        self.draw_branch(x2, y2, new_length, angle + angle_spread, depth + 1, max_depth)
        
        # Right branch
        self.draw_branch(x2, y2, new_length, angle - angle_spread, depth + 1, max_depth)
    
    def render(self):
        """Return the canvas as a string"""
        return '\n'.join(''.join(row) for row in self.canvas)

def main():
    print("="*80)
    print(" " * 25 + "ASCII FRACTAL TREE GENERATOR")
    print("="*80)
    print()
    
    # Create and draw the tree
    tree = FractalTree(width=80, height=35)
    
    # Start from bottom center, growing upward
    start_x = tree.width // 2
    start_y = tree.height - 1
    initial_length = 12
    initial_angle = 90  # Pointing upward
    max_depth = 6
    
    print("Configuration:")
    print(f"  Canvas Size: {tree.width}x{tree.height}")
    print(f"  Starting Position: ({start_x}, {start_y})")
    print(f"  Initial Branch Length: {initial_length}")
    print(f"  Maximum Recursion Depth: {max_depth}")
    print(f"  Branch Angle Spread: 25°")
    print(f"  Length Reduction Factor: 0.67")
    print()
    print("="*80)
    print()
    
    # Draw the tree
    tree.draw_branch(start_x, start_y, initial_length, initial_angle, 0, max_depth)
    
    # Render and display
    output = tree.render()
    print(output)
    
    print()
    print("="*80)
    print()
    
    # Statistics
    total_chars = sum(1 for row in tree.canvas for char in row if char != ' ')
    print("Statistics:")
    print(f"  Total characters drawn: {total_chars}")
    print(f"  Canvas utilization: {(total_chars / (tree.width * tree.height)) * 100:.1f}%")
    print()
    
    print("Visual Legend:")
    print("  █ = Trunk (depth 0)")
    print("  ║ = Main branches (depth 1)")
    print("  │ = Secondary branches (depth 2)")
    print("  | = Tertiary branches (depth 3-4)")
    print("  * = Leaves and finest branches (depth 5-6)")
    print()
    print("="*80)

if __name__ == "__main__":
    main()
