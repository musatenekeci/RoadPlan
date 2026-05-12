namespace DevNotes.Models;

public class Note
{
    public int Id { get; set; }
    public string Title { get; set; } = "Untitled";
    public string Content { get; set; } = "";
    public string Language { get; set; } = "text";
    public string Tags { get; set; } = "";
    public bool IsPinned { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
